// =========================================
// Studio Dashboard – server
// Beheert de projectmappen op je computer
// =========================================

const express = require("express");
const multer = require("multer");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const app = express();
const PORT = 3000;
const PROJECTEN_MAP = path.join(__dirname, "projecten");

const STATUSSEN = ["nog-beginnen", "bezig", "wacht-op-klant", "klaar"];
const SUBMAPPEN = ["site", "images", "documenten", "stijlgids"];

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/projecten", express.static(PROJECTEN_MAP));

// ---------- Hulpfuncties ----------

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
  const { id: _, ...opslaan } = data; // id niet dubbel opslaan
  await fs.writeFile(
    path.join(projectPad(id), "project.json"),
    JSON.stringify(opslaan, null, 2)
  );
}

// Start-HTML voor de site van een nieuw project
function starterHtml(naam) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${naam}</title>
</head>
<body>
  <h1>${naam}</h1>
  <p>Hier komt de website.</p>
</body>
</html>
`;
}

// In welke submap komt een geüpload bestand?
function kiesSubmap(bestand) {
  const ext = path.extname(bestand.originalname).toLowerCase();
  if (bestand.mimetype.startsWith("image/")) return "images";
  if ([".html", ".htm", ".css", ".js"].includes(ext)) return "site";
  return "documenten"; // pdf, docx, enz.
}

// ---------- API: projecten ----------

// Alle projecten ophalen
app.get("/api/projecten", async (req, res) => {
  await fs.mkdir(PROJECTEN_MAP, { recursive: true });
  const items = await fs.readdir(PROJECTEN_MAP, { withFileTypes: true });

  const projecten = [];
  for (const item of items) {
    if (!item.isDirectory()) continue;
    try {
      projecten.push(await leesProject(item.name));
    } catch {
      // map zonder geldige project.json overslaan
    }
  }

  projecten.sort((a, b) => (b.bijgewerkt || "").localeCompare(a.bijgewerkt || ""));
  res.json(projecten);
});

// Eén project ophalen
app.get("/api/projecten/:id", async (req, res) => {
  res.json(await leesProject(req.params.id));
});

// Nieuw project aanmaken (maakt de hele mappenstructuur)
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

  const nu = new Date().toISOString();
  const project = { naam, klant, status, deadline, omschrijving, aangemaakt: nu, bijgewerkt: nu };

  await schrijfProject(id, project);
  await fs.writeFile(path.join(map, "site", "index.html"), starterHtml(naam));

  res.status(201).json({ ...project, id });
});

// Project aanpassen (bijv. de status)
app.patch("/api/projecten/:id", async (req, res) => {
  const project = await leesProject(req.params.id);
  const toegestaan = ["naam", "klant", "status", "deadline", "omschrijving"];

  for (const veld of toegestaan) {
    if (req.body[veld] !== undefined) project[veld] = req.body[veld];
  }

  if (!STATUSSEN.includes(project.status)) {
    return res.status(400).json({ fout: "Onbekende status." });
  }

  project.bijgewerkt = new Date().toISOString();
  await schrijfProject(req.params.id, project);
  res.json(project);
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
            url: `/projecten/${path.basename(map)}/${sub}/${b.name}`,
          };
        })
    );
  }

  res.json(resultaat);
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

// ---------- Foutafhandeling ----------
app.use((fout, req, res, next) => {
  const status = fout.code === "ENOENT" ? 404 : 500;
  const bericht = status === 404 ? "Project niet gevonden." : fout.message;
  res.status(status).json({ fout: bericht });
});

app.listen(PORT, () => {
  console.log(`Studio Dashboard draait op http://localhost:${PORT}`);
});