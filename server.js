// =========================================
// Studio Dashboard – server
// Beheert de projectmappen en klanten op je computer
// =========================================

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { standaardStijlgids, normaliseer, maakHtml, genereer } = require("./stijlgids");
const { maakExports, sluitBrowser } = require("./export");

const app = express();
const PORT = 3000;
const PROJECTEN_MAP = path.join(__dirname, "projecten");
const DATA_MAP = path.join(__dirname, "data");
const KLANTEN_BESTAND = path.join(DATA_MAP, "klanten.json");
const INSTELLINGEN_BESTAND = path.join(DATA_MAP, "instellingen.json");
const STIJLGIDS_STANDAARD_BESTAND = path.join(DATA_MAP, "stijlgids-standaard.json");
const GEBRUIKERS_BESTAND = path.join(DATA_MAP, "gebruikers.json");
const SESSIE_SLEUTEL_BESTAND = path.join(DATA_MAP, "sessie-sleutel.txt");

const STATUSSEN = ["nog-beginnen", "bezig", "wacht-op-klant", "klaar"];
const SUBMAPPEN = ["site", "images", "documenten", "stijlgids"];
const KLANT_VELDEN = ["naam", "bedrijf", "email", "telefoon", "instagram", "website", "notities"];
const LOGO_TYPES = { "image/png": ".png", "image/jpeg": ".jpg", "image/svg+xml": ".svg", "image/webp": ".webp" };
const ROLLEN = ["beheerder", "medewerker"];
const OPEN_API_PADEN = ["/api/setup-status", "/api/setup", "/api/login", "/api/logout", "/api/sessie"];

app.use(express.json());

// Sessie-sleutel: één keer aanmaken, daarna hergebruiken (nooit hardcoded in de code)
function leesOfMaakSessieSleutel() {
  fsSync.mkdirSync(DATA_MAP, { recursive: true });
  try {
    return fsSync.readFileSync(SESSIE_SLEUTEL_BESTAND, "utf8").trim();
  } catch {
    const sleutel = crypto.randomBytes(32).toString("hex");
    fsSync.writeFileSync(SESSIE_SLEUTEL_BESTAND, sleutel);
    return sleutel;
  }
}

app.use(session({
  secret: leesOfMaakSessieSleutel(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dagen
  },
}));

app.use(express.static(path.join(__dirname, "public")));
app.use("/projecten", express.static(PROJECTEN_MAP));

// ---------- Hulpfuncties: projecten ----------

// "Bloemenwinkel Lisa!" -> "bloemenwinkel-lisa"
function maakSlug(tekst) {
  return String(tekst)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Geeft het veilige pad naar een projectmap
function projectPad(id) {
  const veilig = maakSlug(id);
  if (!veilig) throw new Error("Ongeldige projectnaam");
  return path.join(PROJECTEN_MAP, veilig);
}

async function leesProject(id) {
  const map = projectPad(id);
  const tekst = await fs.readFile(path.join(map, "project.json"), "utf8");
  return { ...JSON.parse(tekst), id: path.basename(map) };
}

async function schrijfProject(id, data) {
  // id, cover en stijl worden niet opgeslagen, die rekenen we elke keer opnieuw uit
  const { id: _, cover, stijl, ...opslaan } = data;
  await fs.writeFile(
    path.join(projectPad(id), "project.json"),
    JSON.stringify(opslaan, null, 2)
  );
}

// Namen van alle projectmappen
async function alleProjectIds() {
  await fs.mkdir(PROJECTEN_MAP, { recursive: true });
  const items = await fs.readdir(PROJECTEN_MAP, { withFileTypes: true });
  return items.filter((i) => i.isDirectory() && !i.name.startsWith(".")).map((i) => i.name);
}

// Cover en een korte samenvatting van de stijlgids (voor de kaarten en de galerij)
async function projectExtra(id) {
  const map = projectPad(id);
  const extra = { cover: null, stijl: null };

  for (const naam of ["cover.png", "cover.svg"]) {
    try {
      const info = await fs.stat(path.join(map, "images", naam));
      extra.cover = `/projecten/${path.basename(map)}/images/${naam}?v=${Math.round(info.mtimeMs)}`;
      break;
    } catch {
      // bestaat niet, probeer de volgende
    }
  }

  try {
    const tekst = await fs.readFile(path.join(map, "stijlgids", "stijlgids.json"), "utf8");
    const d = normaliseer(JSON.parse(tekst));
    let pdf = null;
    try {
      const info = await fs.stat(path.join(map, "documenten", "stijlgids.pdf"));
      pdf = `/projecten/${path.basename(map)}/documenten/stijlgids.pdf?v=${Math.round(info.mtimeMs)}`;
    } catch {
      // nog geen PDF
    }
    extra.stijl = {
      slogan: d.slogan,
      kleuren: d.kleuren.map((k) => k.hex),
      hoofd: d.kleuren[d.rollen.hoofd].hex,
      fonts: d.fonts.map((f) => f.font),
      pdf,
    };
  } catch {
    // nog geen stijlgids
  }

  return extra;
}

// In welke submap komt een geüpload bestand?
function kiesSubmap(bestand) {
  if (bestand.mimetype.startsWith("image/")) return "images";
  return "documenten";
}

// ---------- Hulpfuncties: klanten ----------

async function leesKlanten() {
  try {
    return JSON.parse(await fs.readFile(KLANTEN_BESTAND, "utf8"));
  } catch {
    return [];
  }
}

async function schrijfKlanten(lijst) {
  await fs.mkdir(DATA_MAP, { recursive: true });
  await fs.writeFile(KLANTEN_BESTAND, JSON.stringify(lijst, null, 2));
}

function nieuwKlantId(naam, lijst) {
  const basis = maakSlug(naam) || "klant";
  let id = basis;
  let i = 2;
  while (lijst.some((k) => k.id === id)) id = `${basis}-${i++}`;
  return id;
}

// Alleen bekende velden, netjes ingekort
function schoonKlantVeld(veld, waarde) {
  let tekst = typeof waarde === "string" ? waarde.trim() : "";
  tekst = tekst.slice(0, veld === "notities" ? 2000 : 200);
  if (veld === "instagram") {
    tekst = tekst
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/^@/, "")
      .replace(/\/.*$/, "");
  }
  return tekst;
}

function zelfdeNaam(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Zoek een klant op naam, of maak hem aan als hij nog niet bestaat
async function zoekOfMaakKlant(naam) {
  const schoon = String(naam || "").trim();
  if (!schoon) return null;

  const lijst = await leesKlanten();
  let klant = lijst.find((k) => zelfdeNaam(k.naam, schoon));

  if (!klant) {
    klant = { id: nieuwKlantId(schoon, lijst), aangemaakt: new Date().toISOString() };
    for (const veld of KLANT_VELDEN) klant[veld] = "";
    klant.naam = schoonKlantVeld("naam", schoon);
    lijst.push(klant);
    await schrijfKlanten(lijst);
  }

  return klant;
}

// ---------- Hulpfuncties: gebruikers en wachtwoorden ----------

function hashWachtwoord(wachtwoord) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(wachtwoord, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function klopWachtwoord(wachtwoord, opgeslagen) {
  const [salt, hash] = String(opgeslagen || "").split(":");
  if (!salt || !hash) return false;
  const geprobeerd = crypto.scryptSync(wachtwoord, salt, 64);
  const echt = Buffer.from(hash, "hex");
  if (geprobeerd.length !== echt.length) return false;
  return crypto.timingSafeEqual(geprobeerd, echt);
}

async function leesGebruikers() {
  try {
    return JSON.parse(await fs.readFile(GEBRUIKERS_BESTAND, "utf8"));
  } catch {
    return [];
  }
}

async function schrijfGebruikers(lijst) {
  await fs.mkdir(DATA_MAP, { recursive: true });
  await fs.writeFile(GEBRUIKERS_BESTAND, JSON.stringify(lijst, null, 2));
}

function zelfdeEmail(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function nieuwGebruikerId(email, lijst) {
  const basis = maakSlug(email.split("@")[0]) || "gebruiker";
  let id = basis;
  let i = 2;
  while (lijst.some((g) => g.id === id)) id = `${basis}-${i++}`;
  return id;
}

function gebruikerZonderHash(g) {
  const { wachtwoordHash, ...rest } = g;
  return rest;
}

// Simpele rate limiter: max 5 mislukte pogingen per e-mailadres per minuut
const mislukteLogins = new Map();

function magProberen(email) {
  const info = mislukteLogins.get(email);
  if (!info) return true;
  if (Date.now() - info.sinds > 60 * 1000) {
    mislukteLogins.delete(email);
    return true;
  }
  return info.aantal < 5;
}

function registreerMislukking(email) {
  const info = mislukteLogins.get(email);
  if (!info || Date.now() - info.sinds > 60 * 1000) {
    mislukteLogins.set(email, { aantal: 1, sinds: Date.now() });
  } else {
    info.aantal++;
  }
}

// ---------- Middleware: inloggen en rollen ----------

function vereistIngelogd(req, res, next) {
  // req.path is hier al zonder het "/api"-voorvoegsel (dat is het mount-pad van deze
  // middleware), dus vergelijken we met de volledige originele URL.
  const pad = req.originalUrl.split("?")[0];
  if (OPEN_API_PADEN.includes(pad)) return next();
  if (!req.session.gebruikerId) return res.status(401).json({ fout: "Niet ingelogd." });
  next();
}

async function vereistBeheerder(req, res, next) {
  const lijst = await leesGebruikers();
  const gebruiker = lijst.find((g) => g.id === req.session.gebruikerId);
  if (!gebruiker || gebruiker.rol !== "beheerder") {
    return res.status(403).json({ fout: "Alleen voor beheerders." });
  }
  next();
}

// ---------- Hulpfuncties: instellingen ----------

async function leesInstellingen() {
  try {
    return JSON.parse(await fs.readFile(INSTELLINGEN_BESTAND, "utf8"));
  } catch {
    return { studionaam: "" };
  }
}

async function schrijfInstellingen(data) {
  await fs.mkdir(DATA_MAP, { recursive: true });
  await fs.writeFile(INSTELLINGEN_BESTAND, JSON.stringify(data, null, 2));
}

// Zoekt het huidige logo-bestand, welke extensie het ook heeft
async function vindLogoBestand() {
  await fs.mkdir(DATA_MAP, { recursive: true });
  const items = await fs.readdir(DATA_MAP);
  return items.find((naam) => naam.startsWith("logo.")) || null;
}

// De standaard stijlgids die Siem heeft ingesteld, of null als die er nog niet is
async function leesRuweStandaardStijlgids() {
  try {
    return JSON.parse(await fs.readFile(STIJLGIDS_STANDAARD_BESTAND, "utf8"));
  } catch {
    return null;
  }
}

// Stijlgids voor een nieuw project, of als fallback voor een project zonder stijlgids.json
async function standaardOfAppStandaard(naam) {
  const ruw = await leesRuweStandaardStijlgids();
  return ruw ? normaliseer(ruw, naam) : standaardStijlgids(naam);
}

// ---------- API: inloggen en gebruikers ----------

app.use("/api", vereistIngelogd);

// Is er al een beheerder? (bepaalt of de inlogpagina setup of inloggen toont)
app.get("/api/setup-status", async (req, res) => {
  const lijst = await leesGebruikers();
  res.json({ heeftGebruikers: lijst.length > 0 });
});

// Eerste beheerder aanmaken (werkt alleen zolang er nog geen gebruikers zijn)
app.post("/api/setup", async (req, res) => {
  const lijst = await leesGebruikers();
  if (lijst.length > 0) {
    return res.status(409).json({ fout: "Er is al een beheerder aangemaakt." });
  }

  const naam = String(req.body.naam || "").trim().slice(0, 80);
  const email = String(req.body.email || "").trim().toLowerCase().slice(0, 200);
  const wachtwoord = String(req.body.wachtwoord || "");

  if (!naam || !email) return res.status(400).json({ fout: "Vul je naam en e-mail in." });
  if (wachtwoord.length < 8) {
    return res.status(400).json({ fout: "Wachtwoord moet minstens 8 tekens zijn." });
  }

  const gebruiker = {
    id: nieuwGebruikerId(email, lijst),
    naam,
    email,
    wachtwoordHash: hashWachtwoord(wachtwoord),
    rol: "beheerder",
    aangemaakt: new Date().toISOString(),
  };
  lijst.push(gebruiker);
  await schrijfGebruikers(lijst);

  req.session.regenerate((fout) => {
    if (fout) return res.status(500).json({ fout: "Inloggen na setup is mislukt." });
    req.session.gebruikerId = gebruiker.id;
    res.status(201).json({ gebruiker: gebruikerZonderHash(gebruiker) });
  });
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const wachtwoord = String(req.body.wachtwoord || "");

  if (!magProberen(email)) {
    return res.status(429).json({ fout: "Te veel pogingen. Probeer over een minuut opnieuw." });
  }

  const lijst = await leesGebruikers();
  const gebruiker = lijst.find((g) => zelfdeEmail(g.email, email));

  if (!gebruiker || !klopWachtwoord(wachtwoord, gebruiker.wachtwoordHash)) {
    registreerMislukking(email);
    return res.status(401).json({ fout: "E-mail of wachtwoord klopt niet." });
  }

  req.session.regenerate((fout) => {
    if (fout) return res.status(500).json({ fout: "Inloggen is mislukt." });
    req.session.gebruikerId = gebruiker.id;
    res.json({ gebruiker: gebruikerZonderHash(gebruiker) });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/sessie", async (req, res) => {
  if (!req.session.gebruikerId) return res.json({ ingelogd: false });

  const lijst = await leesGebruikers();
  const gebruiker = lijst.find((g) => g.id === req.session.gebruikerId);
  if (!gebruiker) return res.json({ ingelogd: false });

  res.json({ ingelogd: true, gebruiker: gebruikerZonderHash(gebruiker) });
});

// Eigen wachtwoord wijzigen
app.patch("/api/account/wachtwoord", async (req, res) => {
  const lijst = await leesGebruikers();
  const gebruiker = lijst.find((g) => g.id === req.session.gebruikerId);
  if (!gebruiker) return res.status(404).json({ fout: "Gebruiker niet gevonden." });

  const huidig = String(req.body.huidig || "");
  const nieuw = String(req.body.nieuw || "");

  if (!klopWachtwoord(huidig, gebruiker.wachtwoordHash)) {
    return res.status(400).json({ fout: "Huidig wachtwoord klopt niet." });
  }
  if (nieuw.length < 8) {
    return res.status(400).json({ fout: "Nieuw wachtwoord moet minstens 8 tekens zijn." });
  }

  gebruiker.wachtwoordHash = hashWachtwoord(nieuw);
  await schrijfGebruikers(lijst);
  res.json({ ok: true });
});

// Gebruikersbeheer (alleen beheerders)

app.get("/api/gebruikers", vereistBeheerder, async (req, res) => {
  const lijst = await leesGebruikers();
  res.json(lijst.map(gebruikerZonderHash).sort((a, b) => a.naam.localeCompare(b.naam, "nl")));
});

app.post("/api/gebruikers", vereistBeheerder, async (req, res) => {
  const lijst = await leesGebruikers();

  const naam = String(req.body.naam || "").trim().slice(0, 80);
  const email = String(req.body.email || "").trim().toLowerCase().slice(0, 200);
  const wachtwoord = String(req.body.wachtwoord || "");
  const rol = ROLLEN.includes(req.body.rol) ? req.body.rol : "medewerker";

  if (!naam || !email) return res.status(400).json({ fout: "Vul een naam en e-mail in." });
  if (wachtwoord.length < 8) {
    return res.status(400).json({ fout: "Wachtwoord moet minstens 8 tekens zijn." });
  }
  if (lijst.some((g) => zelfdeEmail(g.email, email))) {
    return res.status(409).json({ fout: "Er bestaat al een gebruiker met dit e-mailadres." });
  }

  const gebruiker = {
    id: nieuwGebruikerId(email, lijst),
    naam,
    email,
    wachtwoordHash: hashWachtwoord(wachtwoord),
    rol,
    aangemaakt: new Date().toISOString(),
  };
  lijst.push(gebruiker);
  await schrijfGebruikers(lijst);
  res.status(201).json(gebruikerZonderHash(gebruiker));
});

app.patch("/api/gebruikers/:id", vereistBeheerder, async (req, res) => {
  const lijst = await leesGebruikers();
  const gebruiker = lijst.find((g) => g.id === req.params.id);
  if (!gebruiker) return res.status(404).json({ fout: "Gebruiker niet gevonden." });

  const aantalBeheerders = lijst.filter((g) => g.rol === "beheerder").length;

  if (req.body.rol !== undefined) {
    if (!ROLLEN.includes(req.body.rol)) return res.status(400).json({ fout: "Onbekende rol." });
    if (gebruiker.rol === "beheerder" && req.body.rol !== "beheerder" && aantalBeheerders <= 1) {
      return res.status(409).json({ fout: "Er moet minstens één beheerder overblijven." });
    }
    gebruiker.rol = req.body.rol;
  }
  if (req.body.wachtwoord !== undefined) {
    const nieuw = String(req.body.wachtwoord || "");
    if (nieuw.length < 8) return res.status(400).json({ fout: "Wachtwoord moet minstens 8 tekens zijn." });
    gebruiker.wachtwoordHash = hashWachtwoord(nieuw);
  }

  await schrijfGebruikers(lijst);
  res.json(gebruikerZonderHash(gebruiker));
});

app.delete("/api/gebruikers/:id", vereistBeheerder, async (req, res) => {
  const lijst = await leesGebruikers();
  const gebruiker = lijst.find((g) => g.id === req.params.id);
  if (!gebruiker) return res.status(404).json({ fout: "Gebruiker niet gevonden." });

  if (gebruiker.id === req.session.gebruikerId) {
    return res.status(409).json({ fout: "Je kunt jezelf niet verwijderen." });
  }
  const aantalBeheerders = lijst.filter((g) => g.rol === "beheerder").length;
  if (gebruiker.rol === "beheerder" && aantalBeheerders <= 1) {
    return res.status(409).json({ fout: "Er moet minstens één beheerder overblijven." });
  }

  await schrijfGebruikers(lijst.filter((g) => g.id !== gebruiker.id));
  res.json({ ok: true });
});

// ---------- API: projecten ----------

// Alle projecten ophalen (met cover en stijlgids-samenvatting)
app.get("/api/projecten", async (req, res) => {
  const projecten = [];

  for (const id of await alleProjectIds()) {
    try {
      const project = await leesProject(id);

      // Oude projecten: klantnaam wel, klantId nog niet → koppelen
      if (project.klant && !project.klantId) {
        const klant = await zoekOfMaakKlant(project.klant);
        project.klantId = klant.id;
        await schrijfProject(id, project);
      }

      projecten.push({ ...project, ...(await projectExtra(id)) });
    } catch {
      // map zonder geldige project.json overslaan
    }
  }

  projecten.sort((a, b) => (b.bijgewerkt || "").localeCompare(a.bijgewerkt || ""));
  res.json(projecten);
});

// Eén project ophalen
app.get("/api/projecten/:id", async (req, res) => {
  const project = await leesProject(req.params.id);
  res.json({ ...project, ...(await projectExtra(req.params.id)) });
});

// Nieuw project aanmaken (mappen + standaard stijlgids + PDF/PNG's)
app.post("/api/projecten", async (req, res) => {
  const { naam, klant = "", status = "nog-beginnen", deadline = "", omschrijving = "" } = req.body;

  if (!naam || !maakSlug(naam)) {
    return res.status(400).json({ fout: "Geef het project een naam." });
  }
  if (!STATUSSEN.includes(status)) {
    return res.status(400).json({ fout: "Onbekende status." });
  }

  const id = maakSlug(naam);
  const map = projectPad(id);

  if (fsSync.existsSync(map)) {
    return res.status(409).json({ fout: "Er bestaat al een project met deze naam." });
  }

  for (const sub of SUBMAPPEN) {
    await fs.mkdir(path.join(map, sub), { recursive: true });
  }

  const klantObj = await zoekOfMaakKlant(klant);
  const nu = new Date().toISOString();
  const project = {
    naam,
    klant: klantObj?.naam || "",
    klantId: klantObj?.id || null,
    status,
    deadline,
    omschrijving,
    aangemaakt: nu,
    bijgewerkt: nu,
  };
  const stijl = await standaardOfAppStandaard(naam);

  await schrijfProject(id, project);
  await genereer(map, stijl);

  // PDF en PNG's op de achtergrond maken, zodat je niet hoeft te wachten
  maakExports(map, stijl).catch((fout) => console.error("Export mislukt:", fout.message));

  res.status(201).json({ ...project, id, ...(await projectExtra(id)) });
});

// Project aanpassen (bijv. de status of de klant)
app.patch("/api/projecten/:id", async (req, res) => {
  const project = await leesProject(req.params.id);
  const toegestaan = ["naam", "status", "deadline", "omschrijving"];

  for (const veld of toegestaan) {
    if (req.body[veld] !== undefined) project[veld] = req.body[veld];
  }

  if (req.body.klant !== undefined) {
    const klantObj = await zoekOfMaakKlant(req.body.klant);
    project.klant = klantObj?.naam || "";
    project.klantId = klantObj?.id || null;
  }

  if (!STATUSSEN.includes(project.status)) {
    return res.status(400).json({ fout: "Onbekende status." });
  }

  project.bijgewerkt = new Date().toISOString();
  await schrijfProject(req.params.id, project);
  res.json({ ...project, ...(await projectExtra(req.params.id)) });
});

// ---------- API: bestanden ----------

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const map = projectPad(req.params.id);
        if (!fsSync.existsSync(map)) return cb(new Error("Project bestaat niet"));
        cb(null, path.join(map, kiesSubmap(file)));
      } catch (fout) {
        cb(fout);
      }
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const naam = maakSlug(path.basename(file.originalname, ext)) || "bestand";
      cb(null, naam + ext);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // max 50 MB per bestand
});

// Bestanden uploaden
app.post("/api/projecten/:id/bestanden", upload.array("bestanden"), async (req, res) => {
  const project = await leesProject(req.params.id);
  project.bijgewerkt = new Date().toISOString();
  await schrijfProject(req.params.id, project);
  res.status(201).json({ aantal: req.files.length });
});

// Alle bestanden van een project ophalen, per map
app.get("/api/projecten/:id/bestanden", async (req, res) => {
  const map = projectPad(req.params.id);
  const resultaat = {};

  for (const sub of SUBMAPPEN) {
    const subPad = path.join(map, sub);
    await fs.mkdir(subPad, { recursive: true });
    const bestanden = await fs.readdir(subPad, { withFileTypes: true });

    resultaat[sub] = await Promise.all(
      bestanden
        .filter((b) => b.isFile() && !b.name.startsWith("."))
        .map(async (b) => {
          const info = await fs.stat(path.join(subPad, b.name));
          return {
            naam: b.name,
            grootte: info.size,
            url: `/projecten/${path.basename(map)}/${sub}/${b.name}?v=${Math.round(info.mtimeMs)}`,
          };
        })
    );
  }

  res.json(resultaat);
});

// Bestand verwijderen (verplaatst naar .prullenbak in de projectmap)
app.delete("/api/projecten/:id/bestanden/:map/:naam", async (req, res) => {
  const { map: sub, naam } = req.params;

  if (!SUBMAPPEN.includes(sub)) {
    return res.status(400).json({ fout: "Onbekende map." });
  }
  if (path.basename(naam) !== naam || naam.startsWith(".")) {
    return res.status(400).json({ fout: "Ongeldige bestandsnaam." });
  }

  const projectMap = projectPad(req.params.id);
  const prullenbak = path.join(projectMap, ".prullenbak", sub);
  await fs.mkdir(prullenbak, { recursive: true });

  await fs.rename(
    path.join(projectMap, sub, naam),
    path.join(prullenbak, `${Date.now()}-${naam}`)
  );

  res.json({ ok: true });
});

// Projectmap openen in Finder / Verkenner
app.post("/api/projecten/:id/open", (req, res) => {
  const map = projectPad(req.params.id);
  const commando =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "explorer" : "xdg-open";

  execFile(commando, [map]);
  res.json({ ok: true });
});

// ---------- API: klanten ----------

// Alle klanten ophalen (alfabetisch)
app.get("/api/klanten", async (req, res) => {
  const lijst = await leesKlanten();
  lijst.sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  res.json(lijst);
});

// Nieuwe klant
app.post("/api/klanten", async (req, res) => {
  const lijst = await leesKlanten();
  const naam = schoonKlantVeld("naam", req.body.naam);

  if (!naam) {
    return res.status(400).json({ fout: "Geef de klant een naam." });
  }
  if (lijst.some((k) => zelfdeNaam(k.naam, naam))) {
    return res.status(409).json({ fout: "Er bestaat al een klant met deze naam." });
  }

  const klant = { id: nieuwKlantId(naam, lijst), aangemaakt: new Date().toISOString() };
  for (const veld of KLANT_VELDEN) klant[veld] = schoonKlantVeld(veld, req.body[veld]);

  lijst.push(klant);
  await schrijfKlanten(lijst);
  res.status(201).json(klant);
});

// Klant aanpassen (een nieuwe naam wordt ook in zijn projecten aangepast)
app.patch("/api/klanten/:id", async (req, res) => {
  const lijst = await leesKlanten();
  const klant = lijst.find((k) => k.id === req.params.id);
  if (!klant) return res.status(404).json({ fout: "Klant niet gevonden." });

  const oudeNaam = klant.naam;

  for (const veld of KLANT_VELDEN) {
    if (req.body[veld] !== undefined) klant[veld] = schoonKlantVeld(veld, req.body[veld]);
  }

  if (!klant.naam) {
    return res.status(400).json({ fout: "Geef de klant een naam." });
  }
  if (lijst.some((k) => k.id !== klant.id && zelfdeNaam(k.naam, klant.naam))) {
    return res.status(409).json({ fout: "Er bestaat al een klant met deze naam." });
  }

  await schrijfKlanten(lijst);

  if (klant.naam !== oudeNaam) {
    for (const id of await alleProjectIds()) {
      try {
        const project = await leesProject(id);
        if (project.klantId === klant.id) {
          project.klant = klant.naam;
          await schrijfProject(id, project);
        }
      } catch {
        // map zonder project.json overslaan
      }
    }
  }

  res.json(klant);
});

// Klant verwijderen (alleen als hij geen projecten meer heeft)
app.delete("/api/klanten/:id", async (req, res) => {
  const lijst = await leesKlanten();
  const klant = lijst.find((k) => k.id === req.params.id);
  if (!klant) return res.status(404).json({ fout: "Klant niet gevonden." });

  let aantal = 0;
  for (const id of await alleProjectIds()) {
    try {
      const project = await leesProject(id);
      if (project.klantId === klant.id) aantal++;
    } catch {
      // overslaan
    }
  }

  if (aantal > 0) {
    return res.status(409).json({
      fout: `${klant.naam} heeft nog ${aantal} ${aantal === 1 ? "project" : "projecten"}. Koppel die eerst aan een andere klant.`,
    });
  }

  await schrijfKlanten(lijst.filter((k) => k.id !== klant.id));
  res.json({ ok: true });
});

// ---------- API: stijlgids ----------

// Stijlgids van een project ophalen
app.get("/api/projecten/:id/stijlgids", async (req, res) => {
  const project = await leesProject(req.params.id);
  const bestand = path.join(projectPad(req.params.id), "stijlgids", "stijlgids.json");

  try {
    const data = JSON.parse(await fs.readFile(bestand, "utf8"));
    res.json(normaliseer(data, project.naam));
  } catch {
    res.json(await standaardOfAppStandaard(project.naam));
  }
});

// Stijlgids opslaan en alle bestanden genereren (inclusief PDF en PNG's)
app.put("/api/projecten/:id/stijlgids", async (req, res) => {
  const project = await leesProject(req.params.id);
  const data = normaliseer(req.body, project.naam);
  const map = projectPad(req.params.id);

  const bestanden = await genereer(map, data);

  let waarschuwing = null;
  try {
    bestanden.push(...(await maakExports(map, data)));
  } catch (fout) {
    console.error("Export mislukt:", fout.message);
    waarschuwing = "De PDF en PNG's konden niet gemaakt worden. De rest is wel opgeslagen.";
  }

  project.bijgewerkt = new Date().toISOString();
  await schrijfProject(req.params.id, project);

  res.json({ data, bestanden, waarschuwing });
});

// Live voorbeeld voor de editor (slaat niks op)
app.post("/api/stijlgids/voorbeeld", (req, res) => {
  res.type("html").send(maakHtml(normaliseer(req.body)));
});

// ---------- API: instellingen ----------

// Studionaam en logo
app.get("/api/instellingen", async (req, res) => {
  const instellingen = await leesInstellingen();
  const logoBestand = await vindLogoBestand();
  let logo = null;
  if (logoBestand) {
    const info = await fs.stat(path.join(DATA_MAP, logoBestand));
    logo = `/api/instellingen/logo?v=${Math.round(info.mtimeMs)}`;
  }
  res.json({ studionaam: instellingen.studionaam || "", logo });
});

app.patch("/api/instellingen", async (req, res) => {
  const instellingen = await leesInstellingen();
  instellingen.studionaam = String(req.body.studionaam || "").trim().slice(0, 60);
  await schrijfInstellingen(instellingen);
  res.json({ ok: true });
});

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5 MB
});

app.post("/api/instellingen/logo", uploadLogo.single("logo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ fout: "Geen bestand ontvangen." });
  const ext = LOGO_TYPES[req.file.mimetype];
  if (!ext) return res.status(400).json({ fout: "Alleen PNG, JPG, SVG of WEBP toegestaan." });

  const oud = await vindLogoBestand();
  if (oud) await fs.unlink(path.join(DATA_MAP, oud));
  await fs.writeFile(path.join(DATA_MAP, "logo" + ext), req.file.buffer);
  res.json({ ok: true });
});

app.delete("/api/instellingen/logo", async (req, res) => {
  const oud = await vindLogoBestand();
  if (oud) await fs.unlink(path.join(DATA_MAP, oud));
  res.json({ ok: true });
});

app.get("/api/instellingen/logo", async (req, res) => {
  const bestand = await vindLogoBestand();
  if (!bestand) return res.status(404).end();
  res.sendFile(path.join(DATA_MAP, bestand));
});

// Standaard stijlgids voor nieuwe projecten
app.get("/api/instellingen/stijlgids", async (req, res) => {
  const ruw = await leesRuweStandaardStijlgids();
  res.json(ruw ? normaliseer(ruw, "") : standaardStijlgids(""));
});

app.put("/api/instellingen/stijlgids", async (req, res) => {
  const data = normaliseer(req.body, "");
  data.naam = "";
  for (const veld in data.context) data.context[veld] = "";

  await fs.mkdir(DATA_MAP, { recursive: true });
  await fs.writeFile(STIJLGIDS_STANDAARD_BESTAND, JSON.stringify(data, null, 2));
  res.json({ data });
});

app.delete("/api/instellingen/stijlgids", async (req, res) => {
  try {
    await fs.unlink(STIJLGIDS_STANDAARD_BESTAND);
  } catch {
    // bestond al niet
  }
  res.json({ data: standaardStijlgids("") });
});

// Stijlgids van een bestaand project overnemen als standaard
app.post("/api/instellingen/stijlgids/overnemen", async (req, res) => {
  let project;
  try {
    project = await leesProject(req.body.projectId || "");
  } catch {
    return res.status(404).json({ fout: "Project niet gevonden." });
  }

  const bestand = path.join(projectPad(project.id), "stijlgids", "stijlgids.json");
  let data;
  try {
    data = normaliseer(JSON.parse(await fs.readFile(bestand, "utf8")), project.naam);
  } catch {
    data = standaardStijlgids(project.naam);
  }
  data.naam = "";
  for (const veld in data.context) data.context[veld] = "";

  await fs.mkdir(DATA_MAP, { recursive: true });
  await fs.writeFile(STIJLGIDS_STANDAARD_BESTAND, JSON.stringify(data, null, 2));
  res.json({ data });
});

// Opslag: paden en map openen
app.get("/api/instellingen/paden", (req, res) => {
  res.json({ projecten: PROJECTEN_MAP, data: DATA_MAP });
});

app.post("/api/instellingen/open-map", (req, res) => {
  const paden = { projecten: PROJECTEN_MAP, data: DATA_MAP };
  const pad = paden[req.body.map];
  if (!pad) return res.status(400).json({ fout: "Onbekende map." });

  const commando =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "explorer" : "xdg-open";

  execFile(commando, [pad]);
  res.json({ ok: true });
});

// ---------- Foutafhandeling ----------
app.use((fout, req, res, next) => {
  if (fout.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ fout: "Bestand is te groot (max 5 MB)." });
  }
  const status = fout.code === "ENOENT" ? 404 : 500;
  const bericht = status === 404 ? "Project of bestand niet gevonden." : fout.message;
  res.status(status).json({ fout: bericht });
});

app.listen(PORT, () => {
  console.log(`Studio Dashboard draait op http://localhost:${PORT}`);
});

// Onzichtbare Chrome netjes afsluiten bij Ctrl + C
process.on("SIGINT", async () => {
  await sluitBrowser();
  process.exit(0);
});