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
const { maakExports, maakPdfVanHtml, sluitBrowser } = require("./export");
const { BTW_TARIEVEN, normaliseerDocument, maakFactuurHtml, maakOfferteHtml } = require("./facturatie");

const app = express();
const PORT = 3000;
const PROJECTEN_MAP = path.join(__dirname, "projecten");
const DATA_MAP = path.join(__dirname, "data");
const KLANTEN_MAP = path.join(DATA_MAP, "klanten");
const KLANTEN_BESTAND = path.join(DATA_MAP, "klanten.json");
const INSTELLINGEN_BESTAND = path.join(DATA_MAP, "instellingen.json");
const STIJLGIDS_STANDAARD_BESTAND = path.join(DATA_MAP, "stijlgids-standaard.json");
const GEBRUIKERS_BESTAND = path.join(DATA_MAP, "gebruikers.json");
const SESSIE_SLEUTEL_BESTAND = path.join(DATA_MAP, "sessie-sleutel.txt");
const RECHTEN_BESTAND = path.join(DATA_MAP, "rechten.json");
const FACTURATIE_BESTAND = path.join(DATA_MAP, "facturatie.json");
const FACTUREN_BESTAND = path.join(DATA_MAP, "facturen.json");
const OFFERTES_BESTAND = path.join(DATA_MAP, "offertes.json");
const DIENSTEN_BESTAND = path.join(DATA_MAP, "diensten.json");
const FACTUREN_MAP = path.join(DATA_MAP, "facturen");
const OFFERTES_MAP = path.join(DATA_MAP, "offertes");

const STATUSSEN = ["nog-beginnen", "bezig", "wacht-op-klant", "klaar"];
const SUBMAPPEN = ["site", "images", "documenten", "stijlgids"];
const SUBMAPPEN_KLANT = ["images", "documenten"];
const KLANT_VELDEN = ["naam", "bedrijf", "email", "telefoon", "instagram", "website", "notities"];
const LOGO_TYPES = { "image/png": ".png", "image/jpeg": ".jpg", "image/svg+xml": ".svg", "image/webp": ".webp" };
const ROLLEN = ["beheerder", "medewerker"];
const RECHTEN = ["projecten", "klanten", "stijlgidsen", "instellingen", "facturen"];
const OFFERTE_STATUSSEN = ["concept", "verzonden", "geaccepteerd", "afgewezen"];
const FACTUUR_STATUSSEN = ["concept", "verzonden", "betaald"];
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
  const extra = { cover: null, stijl: null, website: null };

  try {
    const info = await fs.stat(path.join(map, "website", "index.html"));
    extra.website = `/projecten/${path.basename(map)}/website/index.html?v=${Math.round(info.mtimeMs)}`;
  } catch {
    // nog geen website geüpload
  }

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

// Geeft het veilige pad naar de bestandenmap van een klant
function klantPad(id) {
  const veilig = maakSlug(id);
  if (!veilig) throw new Error("Ongeldige klantnaam");
  return path.join(KLANTEN_MAP, veilig);
}

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

// ---------- Hulpfuncties: rechten ----------

// Alleen de rechten van de rol "medewerker" (beheerder kan altijd alles, niet instelbaar)
async function leesRechten() {
  try {
    const opgeslagen = JSON.parse(await fs.readFile(RECHTEN_BESTAND, "utf8"));
    const rechten = {};
    for (const naam of RECHTEN) rechten[naam] = opgeslagen[naam] !== false;
    return rechten;
  } catch {
    const rechten = {};
    for (const naam of RECHTEN) rechten[naam] = true;
    return rechten;
  }
}

async function schrijfRechten(rechten) {
  await fs.mkdir(DATA_MAP, { recursive: true });
  await fs.writeFile(RECHTEN_BESTAND, JSON.stringify(rechten, null, 2));
}

async function rechtenVoor(gebruiker) {
  if (!gebruiker || gebruiker.rol === "beheerder") {
    const alles = {};
    for (const naam of RECHTEN) alles[naam] = true;
    return alles;
  }
  return leesRechten();
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

// Beheerder mag altijd; een medewerker alleen als het recht niet expliciet uitgezet is
function vereistRecht(naam) {
  return async (req, res, next) => {
    const lijst = await leesGebruikers();
    const gebruiker = lijst.find((g) => g.id === req.session.gebruikerId);
    const rechten = await rechtenVoor(gebruiker);
    if (rechten[naam] === false) {
      return res.status(403).json({ fout: "Je rol heeft hier geen toegang toe." });
    }
    next();
  };
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

// ---------- Hulpfuncties: facturatie ----------

async function leesFacturatie() {
  const standaard = {
    bedrijfsnaam: "", adres: "", kvkNummer: "", btwNummer: "", iban: "",
    volgendFactuurnummer: 300101,
    volgendOffertenummer: 1,
  };
  try {
    return { ...standaard, ...JSON.parse(await fs.readFile(FACTURATIE_BESTAND, "utf8")) };
  } catch {
    return standaard;
  }
}

async function schrijfFacturatie(data) {
  await fs.mkdir(DATA_MAP, { recursive: true });
  await fs.writeFile(FACTURATIE_BESTAND, JSON.stringify(data, null, 2));
}

async function leesFacturen() {
  try {
    return JSON.parse(await fs.readFile(FACTUREN_BESTAND, "utf8"));
  } catch {
    return [];
  }
}

async function schrijfFacturen(lijst) {
  await fs.mkdir(DATA_MAP, { recursive: true });
  await fs.writeFile(FACTUREN_BESTAND, JSON.stringify(lijst, null, 2));
}

async function leesOffertes() {
  try {
    return JSON.parse(await fs.readFile(OFFERTES_BESTAND, "utf8"));
  } catch {
    return [];
  }
}

async function schrijfOffertes(lijst) {
  await fs.mkdir(DATA_MAP, { recursive: true });
  await fs.writeFile(OFFERTES_BESTAND, JSON.stringify(lijst, null, 2));
}

async function leesDiensten() {
  try {
    return JSON.parse(await fs.readFile(DIENSTEN_BESTAND, "utf8"));
  } catch {
    return [];
  }
}

async function schrijfDiensten(lijst) {
  await fs.mkdir(DATA_MAP, { recursive: true });
  await fs.writeFile(DIENSTEN_BESTAND, JSON.stringify(lijst, null, 2));
}

// Geeft het eerstvolgende nummer en verhoogt meteen de teller
async function volgendNummer(veld) {
  const facturatie = await leesFacturatie();
  const nummer = facturatie[veld];
  facturatie[veld] = nummer + 1;
  await schrijfFacturatie(facturatie);
  return nummer;
}

// Het logo als data-URI (voor in de factuur/offerte-PDF, geen bestandspad nodig)
async function logoDataUri() {
  const bestand = await vindLogoBestand();
  if (!bestand) return null;
  const ext = "." + bestand.split(".").pop();
  const mime = Object.keys(LOGO_TYPES).find((m) => LOGO_TYPES[m] === ext) || "image/png";
  const data = await fs.readFile(path.join(DATA_MAP, bestand));
  return `data:${mime};base64,${data.toString("base64")}`;
}

async function schrijfOffertePdf(offerte) {
  await fs.mkdir(OFFERTES_MAP, { recursive: true });
  const klant = (await leesKlanten()).find((k) => k.id === offerte.klantId);
  const html = maakOfferteHtml(offerte, await leesFacturatie(), klant, await logoDataUri());
  await maakPdfVanHtml(html, path.join(OFFERTES_MAP, `${offerte.nummer}.pdf`));
}

async function schrijfFactuurPdf(factuur) {
  await fs.mkdir(FACTUREN_MAP, { recursive: true });
  const klant = (await leesKlanten()).find((k) => k.id === factuur.klantId);
  const html = maakFactuurHtml(factuur, await leesFacturatie(), klant, await logoDataUri());
  await maakPdfVanHtml(html, path.join(FACTUREN_MAP, `${factuur.nummer}.pdf`));
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

  res.json({
    ingelogd: true,
    gebruiker: { ...gebruikerZonderHash(gebruiker), rechten: await rechtenVoor(gebruiker) },
  });
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

// Rechten van de rol "medewerker" (beheerder kan altijd alles, niet instelbaar)
app.get("/api/rechten", vereistBeheerder, async (req, res) => {
  res.json(await leesRechten());
});

app.patch("/api/rechten", vereistBeheerder, async (req, res) => {
  const rechten = await leesRechten();
  for (const naam of RECHTEN) {
    if (req.body[naam] !== undefined) rechten[naam] = Boolean(req.body[naam]);
  }
  await schrijfRechten(rechten);
  res.json(rechten);
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
app.post("/api/projecten", vereistRecht("projecten"), async (req, res) => {
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
app.patch("/api/projecten/:id", vereistRecht("projecten"), async (req, res) => {
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
app.post("/api/projecten/:id/bestanden", vereistRecht("projecten"), upload.array("bestanden"), async (req, res) => {
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
app.delete("/api/projecten/:id/bestanden/:map/:naam", vereistRecht("projecten"), async (req, res) => {
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

// ---------- API: website-preview ----------
// De echte, los gebouwde website van een project (anders dan de gegenereerde stijlgids-site)

// Haalt de lokale mapnaam (eerste padsegment van webkitRelativePath) eraf en voorkomt
// path-traversal, zodat "mijn-site/css/stijl.css" -> "css/stijl.css" wordt.
function veiligRelatiefPad(naam) {
  const delen = String(naam)
    .replace(/\\/g, "/")
    .split("/")
    .filter((d) => d && d !== "." && d !== "..");
  delen.shift();
  if (!delen.length) delen.push(path.basename(String(naam)) || "bestand");
  return delen.join("/");
}

const uploadWebsite = multer({
  storage: multer.diskStorage({
    // Let op: multer/busboy geeft in `file.originalname` altijd alleen de kale
    // bestandsnaam terug, ook als de client een pad met "/" als filename meestuurt
    // (bv. "mijn-site/css/stijl.css") — dat deel van het pad wordt onderweg al
    // weggefilterd. Daarom stuurt de client de originele paden apart mee als JSON in
    // het "paden"-veld (vóór de bestanden zelf, zodat het al binnen is tegen de tijd
    // dat het eerste bestand verwerkt wordt) en matchen we hier op volgorde.
    destination: (req, file, cb) => {
      try {
        const map = projectPad(req.params.id);
        if (!fsSync.existsSync(map)) return cb(new Error("Project bestaat niet"));
        if (!Array.isArray(req._websitePaden)) {
          let lijst;
          try {
            lijst = JSON.parse(req.body?.paden);
          } catch {
            lijst = null;
          }
          req._websitePaden = Array.isArray(lijst) ? lijst : [];
          req._websitePadIndex = 0;
        }
        const pad = req._websitePaden[req._websitePadIndex] ?? file.originalname;
        req._websitePadIndex++;
        file._websiteRelatiefPad = veiligRelatiefPad(pad);
        const volledigeMap = path.join(map, "website", path.dirname(file._websiteRelatiefPad));
        fsSync.mkdirSync(volledigeMap, { recursive: true });
        cb(null, volledigeMap);
      } catch (fout) {
        cb(fout);
      }
    },
    filename: (req, file, cb) => {
      cb(null, path.basename(file._websiteRelatiefPad || veiligRelatiefPad(file.originalname)));
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 2000 },
});

// Website uploaden (vervangt een eventuele eerdere upload, die gaat naar .prullenbak)
app.post("/api/projecten/:id/website", vereistRecht("projecten"), async (req, res, next) => {
  const map = projectPad(req.params.id);
  const websiteMap = path.join(map, "website");

  if (fsSync.existsSync(websiteMap)) {
    const prullenbak = path.join(map, ".prullenbak", `website-${Date.now()}`);
    await fs.mkdir(path.dirname(prullenbak), { recursive: true });
    await fs.rename(websiteMap, prullenbak);
  }

  next();
}, uploadWebsite.array("bestanden"), async (req, res) => {
  const project = await leesProject(req.params.id);
  project.bijgewerkt = new Date().toISOString();
  await schrijfProject(req.params.id, project);
  res.status(201).json({ aantal: req.files.length });
});

// Bestandenlijst van de geüploade website (platte lijst met relatieve paden)
app.get("/api/projecten/:id/website", async (req, res) => {
  const websiteMap = path.join(projectPad(req.params.id), "website");

  let namen = [];
  try {
    namen = await fs.readdir(websiteMap, { recursive: true });
  } catch {
    return res.json({ bestaat: false, heeftIndex: false, bestanden: [] });
  }

  const bestanden = [];
  for (const naam of namen) {
    const volledig = path.join(websiteMap, naam);
    const info = await fs.stat(volledig).catch(() => null);
    if (info?.isFile() && !path.basename(naam).startsWith(".")) {
      bestanden.push({ pad: naam.replace(/\\/g, "/"), grootte: info.size });
    }
  }
  bestanden.sort((a, b) => a.pad.localeCompare(b.pad));

  res.json({
    bestaat: bestanden.length > 0,
    heeftIndex: bestanden.some((b) => b.pad === "index.html"),
    bestanden,
  });
});

// Website verwijderen (verplaatst naar .prullenbak, zonder te vervangen)
app.delete("/api/projecten/:id/website", vereistRecht("projecten"), async (req, res) => {
  const map = projectPad(req.params.id);
  const websiteMap = path.join(map, "website");

  if (fsSync.existsSync(websiteMap)) {
    const prullenbak = path.join(map, ".prullenbak", `website-${Date.now()}`);
    await fs.mkdir(path.dirname(prullenbak), { recursive: true });
    await fs.rename(websiteMap, prullenbak);
  }

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
app.post("/api/klanten", vereistRecht("klanten"), async (req, res) => {
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
app.patch("/api/klanten/:id", vereistRecht("klanten"), async (req, res) => {
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
app.delete("/api/klanten/:id", vereistRecht("klanten"), async (req, res) => {
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

// ---------- API: klantbestanden ----------
// Let op: klantbestanden zijn privé (facturen, contracten) en worden, anders dan
// projectbestanden, niet statisch/publiek geserveerd — alleen via deze ingelogde routes.

const uploadKlant = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const map = klantPad(req.params.id);
        if (!fsSync.existsSync(map)) return cb(new Error("Klant bestaat niet"));
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
app.post("/api/klanten/:id/bestanden", vereistRecht("klanten"), uploadKlant.array("bestanden"), async (req, res) => {
  res.status(201).json({ aantal: req.files.length });
});

// Alle bestanden van een klant ophalen, per map
app.get("/api/klanten/:id/bestanden", async (req, res) => {
  const map = klantPad(req.params.id);
  const resultaat = {};

  for (const sub of SUBMAPPEN_KLANT) {
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
            url: `/api/klanten/${path.basename(map)}/bestanden/${sub}/${encodeURIComponent(b.name)}?v=${Math.round(info.mtimeMs)}`,
          };
        })
    );
  }

  res.json(resultaat);
});

// Eén klantbestand opvragen (alleen ingelogd, niet publiek zoals projectbestanden)
app.get("/api/klanten/:id/bestanden/:map/:naam", async (req, res) => {
  const { map: sub, naam } = req.params;

  if (!SUBMAPPEN_KLANT.includes(sub)) {
    return res.status(400).json({ fout: "Onbekende map." });
  }
  if (path.basename(naam) !== naam || naam.startsWith(".")) {
    return res.status(400).json({ fout: "Ongeldige bestandsnaam." });
  }

  res.sendFile(path.join(klantPad(req.params.id), sub, naam));
});

// Klantbestand verwijderen (verplaatst naar .prullenbak in de klantmap)
app.delete("/api/klanten/:id/bestanden/:map/:naam", vereistRecht("klanten"), async (req, res) => {
  const { map: sub, naam } = req.params;

  if (!SUBMAPPEN_KLANT.includes(sub)) {
    return res.status(400).json({ fout: "Onbekende map." });
  }
  if (path.basename(naam) !== naam || naam.startsWith(".")) {
    return res.status(400).json({ fout: "Ongeldige bestandsnaam." });
  }

  const klantMap = klantPad(req.params.id);
  const prullenbak = path.join(klantMap, ".prullenbak", sub);
  await fs.mkdir(prullenbak, { recursive: true });

  await fs.rename(
    path.join(klantMap, sub, naam),
    path.join(prullenbak, `${Date.now()}-${naam}`)
  );

  res.json({ ok: true });
});

// Klantmap openen in Finder / Verkenner
app.post("/api/klanten/:id/open", async (req, res) => {
  const map = klantPad(req.params.id);
  await fs.mkdir(map, { recursive: true });
  const commando =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "explorer" : "xdg-open";

  execFile(commando, [map]);
  res.json({ ok: true });
});

// ---------- API: facturatie ----------

// Bedrijfsgegevens + volgende nummers
app.get("/api/facturatie", async (req, res) => {
  res.json(await leesFacturatie());
});

app.patch("/api/facturatie", vereistRecht("instellingen"), async (req, res) => {
  const facturatie = await leesFacturatie();

  for (const veld of ["bedrijfsnaam", "adres", "kvkNummer", "btwNummer", "iban"]) {
    if (req.body[veld] !== undefined) facturatie[veld] = String(req.body[veld]).slice(0, 200);
  }
  for (const veld of ["volgendFactuurnummer", "volgendOffertenummer"]) {
    const n = Number(req.body[veld]);
    if (req.body[veld] !== undefined && Number.isInteger(n) && n > 0) facturatie[veld] = n;
  }

  await schrijfFacturatie(facturatie);
  res.json(facturatie);
});

// Offertes
app.get("/api/offertes", async (req, res) => {
  res.json((await leesOffertes()).sort((a, b) => b.nummer - a.nummer));
});

app.post("/api/offertes", vereistRecht("facturen"), async (req, res) => {
  const doc = normaliseerDocument(req.body);
  if (!doc.klantId) return res.status(400).json({ fout: "Kies een klant." });

  const lijst = await leesOffertes();
  const nummer = await volgendNummer("volgendOffertenummer");
  const nu = new Date().toISOString();
  const offerte = {
    id: String(nummer),
    nummer,
    ...doc,
    status: "concept",
    omgezetNaarFactuurId: null,
    aangemaakt: nu,
    bijgewerkt: nu,
  };

  lijst.push(offerte);
  await schrijfOffertes(lijst);
  await schrijfOffertePdf(offerte);

  res.status(201).json(offerte);
});

app.get("/api/offertes/:id", async (req, res) => {
  const offerte = (await leesOffertes()).find((o) => o.id === req.params.id);
  if (!offerte) return res.status(404).json({ fout: "Offerte niet gevonden." });
  res.json(offerte);
});

app.patch("/api/offertes/:id", vereistRecht("facturen"), async (req, res) => {
  const lijst = await leesOffertes();
  const offerte = lijst.find((o) => o.id === req.params.id);
  if (!offerte) return res.status(404).json({ fout: "Offerte niet gevonden." });

  if (req.body.status !== undefined) {
    if (!OFFERTE_STATUSSEN.includes(req.body.status)) return res.status(400).json({ fout: "Onbekende status." });
    offerte.status = req.body.status;
  }

  Object.assign(offerte, normaliseerDocument({ ...offerte, ...req.body }));
  offerte.bijgewerkt = new Date().toISOString();
  await schrijfOffertes(lijst);
  await schrijfOffertePdf(offerte);

  res.json(offerte);
});

app.delete("/api/offertes/:id", vereistRecht("facturen"), async (req, res) => {
  const lijst = await leesOffertes();
  if (!lijst.some((o) => o.id === req.params.id)) {
    return res.status(404).json({ fout: "Offerte niet gevonden." });
  }
  await schrijfOffertes(lijst.filter((o) => o.id !== req.params.id));
  res.json({ ok: true });
});

// Offerte omzetten naar een nieuwe factuur
app.post("/api/offertes/:id/omzetten", vereistRecht("facturen"), async (req, res) => {
  const offertes = await leesOffertes();
  const offerte = offertes.find((o) => o.id === req.params.id);
  if (!offerte) return res.status(404).json({ fout: "Offerte niet gevonden." });
  if (offerte.omgezetNaarFactuurId) {
    return res.status(409).json({ fout: "Deze offerte is al omgezet naar een factuur." });
  }

  const facturen = await leesFacturen();
  const nummer = await volgendNummer("volgendFactuurnummer");
  const nu = new Date().toISOString();
  const factuur = {
    id: String(nummer),
    nummer,
    klantId: offerte.klantId,
    projectId: offerte.projectId,
    datum: nu.slice(0, 10),
    vervaldatum: "",
    regels: offerte.regels,
    notities: offerte.notities,
    status: "concept",
    vanOfferteId: offerte.id,
    aangemaakt: nu,
    bijgewerkt: nu,
  };

  facturen.push(factuur);
  await schrijfFacturen(facturen);
  await schrijfFactuurPdf(factuur);

  offerte.omgezetNaarFactuurId = factuur.id;
  offerte.bijgewerkt = nu;
  await schrijfOffertes(offertes);

  res.status(201).json(factuur);
});

app.get("/api/offertes/:id/pdf", async (req, res) => {
  const offerte = (await leesOffertes()).find((o) => o.id === req.params.id);
  if (!offerte) return res.status(404).json({ fout: "Offerte niet gevonden." });
  res.sendFile(path.join(OFFERTES_MAP, `${offerte.nummer}.pdf`));
});

// Facturen
app.get("/api/facturen", async (req, res) => {
  res.json((await leesFacturen()).sort((a, b) => b.nummer - a.nummer));
});

app.post("/api/facturen", vereistRecht("facturen"), async (req, res) => {
  const doc = normaliseerDocument(req.body);
  if (!doc.klantId) return res.status(400).json({ fout: "Kies een klant." });

  const lijst = await leesFacturen();
  const nummer = await volgendNummer("volgendFactuurnummer");
  const nu = new Date().toISOString();
  const factuur = {
    id: String(nummer),
    nummer,
    ...doc,
    status: "concept",
    vanOfferteId: null,
    aangemaakt: nu,
    bijgewerkt: nu,
  };

  lijst.push(factuur);
  await schrijfFacturen(lijst);
  await schrijfFactuurPdf(factuur);

  res.status(201).json(factuur);
});

app.get("/api/facturen/:id", async (req, res) => {
  const factuur = (await leesFacturen()).find((f) => f.id === req.params.id);
  if (!factuur) return res.status(404).json({ fout: "Factuur niet gevonden." });
  res.json(factuur);
});

app.patch("/api/facturen/:id", vereistRecht("facturen"), async (req, res) => {
  const lijst = await leesFacturen();
  const factuur = lijst.find((f) => f.id === req.params.id);
  if (!factuur) return res.status(404).json({ fout: "Factuur niet gevonden." });

  if (req.body.status !== undefined) {
    if (!FACTUUR_STATUSSEN.includes(req.body.status)) return res.status(400).json({ fout: "Onbekende status." });
    factuur.status = req.body.status;
  }

  Object.assign(factuur, normaliseerDocument({ ...factuur, ...req.body }));
  factuur.bijgewerkt = new Date().toISOString();
  await schrijfFacturen(lijst);
  await schrijfFactuurPdf(factuur);

  res.json(factuur);
});

app.delete("/api/facturen/:id", vereistRecht("facturen"), async (req, res) => {
  const lijst = await leesFacturen();
  if (!lijst.some((f) => f.id === req.params.id)) {
    return res.status(404).json({ fout: "Factuur niet gevonden." });
  }
  await schrijfFacturen(lijst.filter((f) => f.id !== req.params.id));
  res.json({ ok: true });
});

app.get("/api/facturen/:id/pdf", async (req, res) => {
  const factuur = (await leesFacturen()).find((f) => f.id === req.params.id);
  if (!factuur) return res.status(404).json({ fout: "Factuur niet gevonden." });
  res.sendFile(path.join(FACTUREN_MAP, `${factuur.nummer}.pdf`));
});

// Diensten: de prijslijst voor de prijscalculator
app.get("/api/diensten", async (req, res) => {
  res.json(await leesDiensten());
});

app.post("/api/diensten", vereistRecht("facturen"), async (req, res) => {
  const naam = String(req.body.naam || "").trim().slice(0, 100);
  const prijs = Number(req.body.prijs);
  const btw = BTW_TARIEVEN.includes(Number(req.body.btw)) ? Number(req.body.btw) : 21;

  if (!naam) return res.status(400).json({ fout: "Geef de dienst een naam." });
  if (!Number.isFinite(prijs) || prijs < 0) return res.status(400).json({ fout: "Ongeldige prijs." });

  const lijst = await leesDiensten();
  const basis = maakSlug(naam) || "dienst";
  let id = basis;
  let i = 2;
  while (lijst.some((d) => d.id === id)) id = `${basis}-${i++}`;

  const dienst = { id, naam, prijs: Math.round(prijs * 100) / 100, btw, omschrijving: String(req.body.omschrijving || "").trim().slice(0, 200) };
  lijst.push(dienst);
  await schrijfDiensten(lijst);
  res.status(201).json(dienst);
});

app.patch("/api/diensten/:id", vereistRecht("facturen"), async (req, res) => {
  const lijst = await leesDiensten();
  const dienst = lijst.find((d) => d.id === req.params.id);
  if (!dienst) return res.status(404).json({ fout: "Dienst niet gevonden." });

  if (req.body.naam !== undefined) dienst.naam = String(req.body.naam).trim().slice(0, 100);
  if (req.body.omschrijving !== undefined) dienst.omschrijving = String(req.body.omschrijving).trim().slice(0, 200);
  if (req.body.prijs !== undefined) {
    const prijs = Number(req.body.prijs);
    if (!Number.isFinite(prijs) || prijs < 0) return res.status(400).json({ fout: "Ongeldige prijs." });
    dienst.prijs = Math.round(prijs * 100) / 100;
  }
  if (req.body.btw !== undefined) {
    if (!BTW_TARIEVEN.includes(Number(req.body.btw))) return res.status(400).json({ fout: "Onbekend BTW-tarief." });
    dienst.btw = Number(req.body.btw);
  }

  await schrijfDiensten(lijst);
  res.json(dienst);
});

app.delete("/api/diensten/:id", vereistRecht("facturen"), async (req, res) => {
  const lijst = await leesDiensten();
  if (!lijst.some((d) => d.id === req.params.id)) {
    return res.status(404).json({ fout: "Dienst niet gevonden." });
  }
  await schrijfDiensten(lijst.filter((d) => d.id !== req.params.id));
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
app.put("/api/projecten/:id/stijlgids", vereistRecht("stijlgidsen"), async (req, res) => {
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

app.patch("/api/instellingen", vereistRecht("instellingen"), async (req, res) => {
  const instellingen = await leesInstellingen();
  instellingen.studionaam = String(req.body.studionaam || "").trim().slice(0, 60);
  await schrijfInstellingen(instellingen);
  res.json({ ok: true });
});

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5 MB
});

app.post("/api/instellingen/logo", vereistRecht("instellingen"), uploadLogo.single("logo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ fout: "Geen bestand ontvangen." });
  const ext = LOGO_TYPES[req.file.mimetype];
  if (!ext) return res.status(400).json({ fout: "Alleen PNG, JPG, SVG of WEBP toegestaan." });

  const oud = await vindLogoBestand();
  if (oud) await fs.unlink(path.join(DATA_MAP, oud));
  await fs.writeFile(path.join(DATA_MAP, "logo" + ext), req.file.buffer);
  res.json({ ok: true });
});

app.delete("/api/instellingen/logo", vereistRecht("instellingen"), async (req, res) => {
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

app.put("/api/instellingen/stijlgids", vereistRecht("instellingen"), async (req, res) => {
  const data = normaliseer(req.body, "");
  data.naam = "";
  for (const veld in data.context) data.context[veld] = "";

  await fs.mkdir(DATA_MAP, { recursive: true });
  await fs.writeFile(STIJLGIDS_STANDAARD_BESTAND, JSON.stringify(data, null, 2));
  res.json({ data });
});

app.delete("/api/instellingen/stijlgids", vereistRecht("instellingen"), async (req, res) => {
  try {
    await fs.unlink(STIJLGIDS_STANDAARD_BESTAND);
  } catch {
    // bestond al niet
  }
  res.json({ data: standaardStijlgids("") });
});

// Stijlgids van een bestaand project overnemen als standaard
app.post("/api/instellingen/stijlgids/overnemen", vereistRecht("instellingen"), async (req, res) => {
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