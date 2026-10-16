// =========================================
// Studio Dashboard – app
// =========================================

// ---------- Instellingen ----------
const STATUS = {
  "nog-beginnen":   { label: "Nog beginnen",   kleur: "yellow", icoon: "clock" },
  "bezig":          { label: "Bezig",          kleur: "blue",   icoon: "loader" },
  "wacht-op-klant": { label: "Wacht op klant", kleur: "red",    icoon: "hourglass" },
  "klaar":          { label: "Klaar",          kleur: "green",  icoon: "circle-check" },
};

const PAGINAS = {
  dashboard:    "Dashboard",
  projecten:    "Projecten",
  stijlgidsen:  "Stijlgidsen",
  websites:     "Websites",
  klanten:      "Klanten",
  offertes:     "Offertes",
  facturen:     "Facturen",
  prijscalculator: "Prijscalculator",
  gebruikers:   "Gebruikers",
  instellingen: "Instellingen",
};

const BTW_TARIEVEN = [0, 9, 21];

const OFFERTE_STATUS = {
  concept:      { label: "Concept",      kleur: "yellow" },
  verzonden:    { label: "Verzonden",    kleur: "blue" },
  geaccepteerd: { label: "Geaccepteerd", kleur: "green" },
  afgewezen:    { label: "Afgewezen",    kleur: "red" },
};

const FACTUUR_STATUS = {
  concept:   { label: "Concept",   kleur: "yellow" },
  verzonden: { label: "Verzonden", kleur: "blue" },
  betaald:   { label: "Betaald",   kleur: "green" },
};

const ROLLEN = {
  beheerder: "Beheerder",
  medewerker: "Medewerker",
};

const MAPPEN = {
  images:     { label: "Afbeeldingen", icoon: "image" },
  documenten: { label: "Documenten",   icoon: "file-text" },
  stijlgids:  { label: "Stijlgids",    icoon: "palette" },
};

const KLANT_MAPPEN = {
  images:     { label: "Afbeeldingen", icoon: "image" },
  documenten: { label: "Documenten",   icoon: "file-text" },
};

const SORTERINGEN = {
  bijgewerkt: "Laatst bijgewerkt",
  deadline: "Deadline",
  naam: "Naam (A–Z)",
};

// Zachte kleuren voor de rondjes met initialen
const AVATAR_KLEUREN = ["#F3D9CF", "#DCE8F5", "#E3F0DD", "#F5EBCF", "#EADCF2", "#D8EFEC", "#F2DCE4"];

let projecten = [];
let klanten = [];
let huidigePagina = "dashboard";
let openProjectId = null;
let openKlantId = null;
let bestanden = null;
let klantBestanden = null;
let websiteBestanden = null; // { bestaat, heeftIndex, bestanden } van het open project
let zoekterm = "";
let actiefFilter = "";       // filter op het dashboard
let projectFilter = "";      // filter op de pagina Projecten
let sortering = "bijgewerkt";
let modus = "project"; // "project" of "stijlgids"
let instellingen = { studionaam: "", logo: null };
let facturatie = null;
let standaardStijl = null;   // standaard stijlgids, voor het mini-voorbeeld op Instellingen
let paden = null;            // paden van projecten/ en data/, voor Instellingen
let ingelogdeGebruiker = null;
let gebruikers = [];          // alleen geladen voor de pagina Gebruikers (beheerder)
let rechten = null;           // rechten van de rol Medewerker, alleen geladen voor beheerders
let offertes = [];
let facturen = [];
let diensten = [];
let calculatorKlantId = "";   // gekozen klant op de pagina Prijscalculator
const calculatorAantallen = {}; // { dienstId: aantal } — alleen lokale staat, niet opgeslagen
let bewerkType = null;        // "offerte" | "factuur" | null — bepaalt of de document-editor toont
let bewerkId = null;          // bestaand document-id, of null bij een nieuwe
let bewerkDocument = null;    // { klantId, projectId, datum, vervaldatum, regels, notities, status }

const RECHTEN_LABELS = {
  projecten: "Projecten aanmaken, bewerken en verwijderen",
  klanten: "Klanten aanmaken, bewerken en verwijderen",
  stijlgidsen: "Stijlgidsen opslaan",
  instellingen: "Instellingen aanpassen (studio, standaard stijlgids, opslag)",
  facturen: "Offertes en facturen aanmaken, bewerken en verwijderen",
};

const geschiedenis = { terug: [], vooruit: [] };

const content = document.getElementById("content");
const titel = document.getElementById("page-title");
const zoekveld = document.getElementById("search");
const [knopTerug, knopVooruit] = document.querySelectorAll(".topbar__arrows .icon-btn");

// ---------- Hulpfuncties ----------

async function api(url, opties = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opties,
  });
  if (res.status === 401) {
    window.location.href = "/login.html";
    throw new Error("Niet ingelogd.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.fout || "Er ging iets mis.");
  return data;
}

function esc(tekst) {
  return String(tekst ?? "").replace(/[&<>"']/g, (t) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[t]));
}

// Mag de ingelogde gebruiker dit? (vóór de sessie geladen is, of voor beheerders: altijd ja)
function magIk(naam) {
  return ingelogdeGebruiker?.rechten?.[naam] !== false;
}

function euro(bedrag) {
  return (Number(bedrag) || 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
}

// Zelfde rekenwerk als facturatie.js op de server, voor direct feedback tijdens het bewerken
function berekenTotalen(regels) {
  const perTarief = new Map();
  for (const r of regels) {
    const sub = (Number(r.aantal) || 0) * (Number(r.prijsPerStuk) || 0);
    perTarief.set(r.btw, (perTarief.get(r.btw) || 0) + sub);
  }
  const btwOpbouw = [...perTarief.entries()]
    .map(([tarief, subtotaal]) => ({ tarief, subtotaal, btw: (subtotaal * tarief) / 100 }))
    .sort((a, b) => b.tarief - a.tarief);
  const subtotaal = btwOpbouw.reduce((som, t) => som + t.subtotaal, 0);
  const btwTotaal = btwOpbouw.reduce((som, t) => som + t.btw, 0);
  return { subtotaal, btwOpbouw, btwTotaal, totaal: subtotaal + btwTotaal };
}

function geleden(datum) {
  if (!datum) return "";
  const sec = Math.floor((Date.now() - new Date(datum)) / 1000);
  if (sec < 60) return "zojuist";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min geleden`;
  const uur = Math.floor(min / 60);
  if (uur < 24) return `${uur} uur geleden`;
  const dag = Math.floor(uur / 24);
  if (dag < 30) return dag === 1 ? "gisteren" : `${dag} dagen geleden`;
  return korteDatum(datum);
}

function korteDatum(datum) {
  if (!datum) return "";
  return new Date(datum).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function dagenTot(datum) {
  if (!datum) return null;
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  return Math.round((new Date(datum) - vandaag) / 86400000);
}

function formatGrootte(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isAfbeelding(naam) {
  return /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(naam);
}

function bestandIcoon(naam) {
  const ext = naam.split(".").pop().toLowerCase();
  if (ext === "pdf") return "file-text";
  if (["html", "htm", "css", "js", "json"].includes(ext)) return "file-code";
  if (["doc", "docx", "txt", "md"].includes(ext)) return "file-type";
  if (["zip", "rar"].includes(ext)) return "file-archive";
  return "file";
}

function tel(status, lijst = projecten) {
  return lijst.filter((p) => p.status === status).length;
}

function toast(tekst, soort = "ok") {
  const el = document.createElement("div");
  el.className = `toast toast--${soort}`;
  el.textContent = tekst;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("is-weg"), 2200);
  setTimeout(() => el.remove(), 2600);
}

// "Lisa de Vries" → "LV"
function initialen(naam) {
  const woorden = String(naam || "?").trim().split(/\s+/).filter(Boolean);
  const letters = woorden.length > 1
    ? woorden[0][0] + woorden[woorden.length - 1][0]
    : (woorden[0] || "?").slice(0, 2);
  return letters.toUpperCase();
}

// Altijd dezelfde kleur voor dezelfde naam
function avatarKleur(naam) {
  let som = 0;
  for (const letter of String(naam)) som += letter.charCodeAt(0);
  return AVATAR_KLEUREN[som % AVATAR_KLEUREN.length];
}

function websiteUrl(adres) {
  return /^https?:\/\//i.test(adres) ? adres : `https://${adres}`;
}

function projectenVanKlant(klantId) {
  return projecten.filter((p) => p.klantId === klantId);
}

// ---------- Navigatie ----------

function huidigeStand() {
  return { pagina: huidigePagina, projectId: openProjectId, klantId: openKlantId, modus };
}

function gaNaar(pagina, projectId = null, { opslaan = true, nieuweModus = "project", klantId = null } = {}) {
  if (opslaan) {
    geschiedenis.terug.push(huidigeStand());
    geschiedenis.vooruit = [];
  }

  huidigePagina = pagina;
  openProjectId = projectId;
  openKlantId = projectId ? null : klantId;
  modus = projectId ? nieuweModus : "project";
  stijlgidsBron = "project";
  bewerkType = null;
  bewerkId = null;
  bewerkDocument = null;
  bestanden = null;
  klantBestanden = null;
  websiteBestanden = null;
  stijlgids = null;

  document.querySelectorAll(".nav__item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.page === pagina);
  });

  render();
  if (projectId && modus === "project") { laadBestanden(); laadWebsiteBestanden(); }
  if (projectId && modus === "stijlgids") laadStijlgids();
  if (!projectId && openKlantId) laadKlantBestanden();
  if (pagina === "instellingen" && !projectId) { laadInstellingenStijlgids(); laadFacturatie(); }
  if (pagina === "gebruikers" && !projectId) laadGebruikers();
  if (pagina === "offertes" && !projectId) laadOffertes();
  if (pagina === "facturen" && !projectId) laadFacturen();
  window.scrollTo(0, 0);
}

function gaNaarStand(stand) {
  gaNaar(stand.pagina, stand.projectId, {
    opslaan: false,
    nieuweModus: stand.modus,
    klantId: stand.klantId,
  });
}

knopTerug.addEventListener("click", () => {
  const vorige = geschiedenis.terug.pop();
  if (!vorige) return;
  geschiedenis.vooruit.push(huidigeStand());
  gaNaarStand(vorige);
});

knopVooruit.addEventListener("click", () => {
  const volgende = geschiedenis.vooruit.pop();
  if (!volgende) return;
  geschiedenis.terug.push(huidigeStand());
  gaNaarStand(volgende);
});

// ---------- Data ----------

async function laadProjecten() {
  try {
    // Eerst projecten (die koppelen oude projecten aan klanten), daarna klanten
    projecten = await api("/api/projecten");
    klanten = await api("/api/klanten");
  } catch (fout) {
    toast(fout.message, "fout");
  }
  render();
}

async function laadSessie() {
  try {
    const sessie = await api("/api/sessie");
    if (!sessie.ingelogd) {
      window.location.href = "/login.html";
      return;
    }
    ingelogdeGebruiker = sessie.gebruiker;
    toepassenProfiel();
  } catch {
    // api() heeft bij 401 al doorgestuurd naar /login.html
  }
}

function toepassenProfiel() {
  if (!ingelogdeGebruiker) return;

  const knop = document.getElementById("profiel-knop");
  document.getElementById("profiel-avatar").innerHTML = avatar(ingelogdeGebruiker.naam);
  document.getElementById("profiel-naam").textContent = ingelogdeGebruiker.naam;
  document.getElementById("profiel-rol").textContent = ROLLEN[ingelogdeGebruiker.rol] || ingelogdeGebruiker.rol;
  knop.hidden = false;

  document.getElementById("nav-gebruikers").hidden = ingelogdeGebruiker.rol !== "beheerder";
  lucide.createIcons();
}

async function uitloggen() {
  try {
    await api("/api/logout", { method: "POST" });
  } catch {
    // negeren, we gaan sowieso naar de inlogpagina
  }
  window.location.href = "/login.html";
}

function openWachtwoordFormulier() {
  openModal({
    kop: "Wachtwoord wijzigen",
    knop: "Opslaan",
    inhoud: `
      <label class="veld">
        <span>Huidig wachtwoord</span>
        <input name="huidig" type="password" required autocomplete="current-password">
      </label>
      <label class="veld">
        <span>Nieuw wachtwoord</span>
        <input name="nieuw" type="password" required minlength="8" autocomplete="new-password">
      </label>
      <p class="muted klein">Minstens 8 tekens.</p>
    `,
    opslaan: async (data) => {
      await api("/api/account/wachtwoord", { method: "PATCH", body: JSON.stringify(data) });
      toast("Wachtwoord gewijzigd");
    },
  });
}

async function laadInstellingen() {
  try {
    instellingen = await api("/api/instellingen");
    toepassenInstellingen();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

function toepassenInstellingen() {
  document.title = instellingen.studionaam
    ? `${instellingen.studionaam} — Studio Dashboard`
    : "Studio Dashboard";

  const naamEl = document.querySelector(".sidebar__logo span");
  if (naamEl) naamEl.textContent = instellingen.studionaam || "studio";

  const logoEl = document.querySelector(".sidebar__logo .logo-mark");
  if (logoEl) {
    logoEl.classList.toggle("logo-mark--afbeelding", Boolean(instellingen.logo));
    logoEl.style.backgroundImage = instellingen.logo ? `url('${instellingen.logo}')` : "";
  }
}

async function laadPaden() {
  try {
    paden = await api("/api/instellingen/paden");
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function laadInstellingenStijlgids() {
  try {
    standaardStijl = await api("/api/instellingen/stijlgids");
    if (huidigePagina === "instellingen" && !openProjectId) render();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function laadFacturatie() {
  try {
    facturatie = await api("/api/facturatie");
    if (huidigePagina === "instellingen" && !openProjectId) render();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function slaFacturatieOp() {
  try {
    facturatie = await api("/api/facturatie", {
      method: "PATCH",
      body: JSON.stringify({
        bedrijfsnaam: document.getElementById("fact-bedrijfsnaam").value,
        adres: document.getElementById("fact-adres").value,
        kvkNummer: document.getElementById("fact-kvknummer").value,
        btwNummer: document.getElementById("fact-btwnummer").value,
        iban: document.getElementById("fact-iban").value,
        volgendOffertenummer: document.getElementById("fact-volgend-offerte").value,
        volgendFactuurnummer: document.getElementById("fact-volgend-factuur").value,
      }),
    });
    toast("Facturatiegegevens opgeslagen");
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

function bewerkStandaardStijlgids() {
  stijlgidsBron = "standaard";
  modus = "stijlgids";
  openProjectId = null;
  openKlantId = null;
  render();
  laadStijlgids();
}

async function slaStudionaamOp(waarde) {
  try {
    await api("/api/instellingen", { method: "PATCH", body: JSON.stringify({ studionaam: waarde }) });
    instellingen.studionaam = waarde.trim();
    toepassenInstellingen();
    toast("Studionaam opgeslagen");
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function uploadLogo(bestand) {
  if (!bestand) return;
  const formData = new FormData();
  formData.append("logo", bestand);

  try {
    const res = await fetch("/api/instellingen/logo", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.fout || "Uploaden mislukt.");
    toast("Logo geüpload");
    await laadInstellingen();
    render();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function verwijderLogo() {
  try {
    await api("/api/instellingen/logo", { method: "DELETE" });
    toast("Logo verwijderd");
    await laadInstellingen();
    render();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

function openOvernemenFormulier() {
  if (!projecten.length) return toast("Je hebt nog geen projecten om van over te nemen.", "fout");

  const opties = projecten.map((p) => `<option value="${esc(p.id)}">${esc(p.naam)}</option>`).join("");

  openModal({
    kop: "Stijlgids overnemen",
    knop: "Overnemen",
    inhoud: `
      <label class="veld">
        <span>Project</span>
        <select name="projectId" required>${opties}</select>
      </label>
      <p class="muted klein">De kleuren, fonts en knoppen van dit project worden de nieuwe standaard voor nieuwe projecten.</p>
    `,
    opslaan: async (data) => {
      await api("/api/instellingen/stijlgids/overnemen", { method: "POST", body: JSON.stringify(data) });
      toast("Standaard stijlgids overgenomen");
      await laadInstellingenStijlgids();
    },
  });
}

async function resetStandaardStijlgids() {
  try {
    await api("/api/instellingen/stijlgids", { method: "DELETE" });
    toast("Teruggezet naar de app-standaard");
    await laadInstellingenStijlgids();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function openOpslagMap(map) {
  try {
    await api("/api/instellingen/open-map", { method: "POST", body: JSON.stringify({ map }) });
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function laadBestanden() {
  if (!openProjectId) return;
  try {
    bestanden = await api(`/api/projecten/${openProjectId}/bestanden`);
  } catch (fout) {
    toast(fout.message, "fout");
    bestanden = {};
  }
  render();
}

async function wijzigStatus(id, status) {
  try {
    const bijgewerkt = await api(`/api/projecten/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    projecten = projecten.map((p) => (p.id === id ? { ...p, ...bijgewerkt } : p));
    toast(`Status aangepast naar "${STATUS[status].label}"`);
    render();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function openMap(id) {
  try {
    await api(`/api/projecten/${id}/open`, { method: "POST" });
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function uploadBestanden(lijst) {
  if (!lijst.length || !openProjectId) return;

  const formData = new FormData();
  for (const bestand of lijst) formData.append("bestanden", bestand);

  toast(`${lijst.length} ${lijst.length === 1 ? "bestand" : "bestanden"} uploaden…`);

  try {
    const res = await fetch(`/api/projecten/${openProjectId}/bestanden`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.fout || "Uploaden mislukt.");

    toast(`${data.aantal} ${data.aantal === 1 ? "bestand" : "bestanden"} geüpload`);
    await laadProjecten();
    await laadBestanden();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function verwijderBestand(map, naam) {
  try {
    await api(`/api/projecten/${openProjectId}/bestanden/${map}/${encodeURIComponent(naam)}`, {
      method: "DELETE",
    });
    toast(`"${naam}" naar de prullenbak verplaatst`);
    await laadBestanden();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function laadWebsiteBestanden() {
  if (!openProjectId) return;
  try {
    websiteBestanden = await api(`/api/projecten/${openProjectId}/website`);
  } catch (fout) {
    toast(fout.message, "fout");
    websiteBestanden = { bestaat: false, heeftIndex: false, bestanden: [] };
  }
  render();
}

async function uploadWebsiteBestanden(lijst) {
  if (!lijst.length || !openProjectId) return;

  const formData = new FormData();
  // Paden apart meesturen (vóór de bestanden): de bestandsnaam zelf verliest het pad
  // onderweg (multer/busboy houdt altijd alleen de bestandsnaam over uit "filename",
  // ook als je er zelf een pad met "/" in zet).
  formData.append("paden", JSON.stringify(lijst.map((bestand) => bestand.webkitRelativePath || bestand.name)));
  for (const bestand of lijst) {
    formData.append("bestanden", bestand);
  }

  toast(`Website uploaden (${lijst.length} ${lijst.length === 1 ? "bestand" : "bestanden"})…`);

  try {
    const res = await fetch(`/api/projecten/${openProjectId}/website`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.fout || "Uploaden mislukt.");

    toast(`Website geüpload (${data.aantal} bestanden)`);
    await laadWebsiteBestanden();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function verwijderWebsite() {
  try {
    await api(`/api/projecten/${openProjectId}/website`, { method: "DELETE" });
    toast("Website verwijderd");
    await laadWebsiteBestanden();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

function probeerRevisieToevoegen() {
  const invoer = document.getElementById("revisie-invoer");
  const omschrijving = invoer?.value.trim();
  if (!omschrijving) return;
  invoer.value = "";
  voegRevisieToe(omschrijving);
}

async function voegRevisieToe(omschrijving) {
  try {
    await api(`/api/projecten/${openProjectId}/revisies`, { method: "POST", body: JSON.stringify({ omschrijving }) });
    await laadProjecten();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function wijzigRevisie(id, afgehandeld) {
  try {
    await api(`/api/projecten/${openProjectId}/revisies/${id}`, { method: "PATCH", body: JSON.stringify({ afgehandeld }) });
    await laadProjecten();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function verwijderRevisie(id) {
  try {
    await api(`/api/projecten/${openProjectId}/revisies/${id}`, { method: "DELETE" });
    toast("Revisie verwijderd");
    await laadProjecten();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function laadKlantBestanden() {
  if (!openKlantId) return;
  try {
    klantBestanden = await api(`/api/klanten/${openKlantId}/bestanden`);
  } catch (fout) {
    toast(fout.message, "fout");
    klantBestanden = {};
  }
  render();
}

async function openKlantMap(id) {
  try {
    await api(`/api/klanten/${id}/open`, { method: "POST" });
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function uploadKlantBestanden(lijst) {
  if (!lijst.length || !openKlantId) return;

  const formData = new FormData();
  for (const bestand of lijst) formData.append("bestanden", bestand);

  toast(`${lijst.length} ${lijst.length === 1 ? "bestand" : "bestanden"} uploaden…`);

  try {
    const res = await fetch(`/api/klanten/${openKlantId}/bestanden`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.fout || "Uploaden mislukt.");

    toast(`${data.aantal} ${data.aantal === 1 ? "bestand" : "bestanden"} geüpload`);
    await laadKlantBestanden();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function verwijderKlantBestand(map, naam) {
  try {
    await api(`/api/klanten/${openKlantId}/bestanden/${map}/${encodeURIComponent(naam)}`, {
      method: "DELETE",
    });
    toast(`"${naam}" naar de prullenbak verplaatst`);
    await laadKlantBestanden();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function verwijderKlant(id) {
  try {
    await api(`/api/klanten/${id}`, { method: "DELETE" });
    toast("Klant verwijderd");
    gaNaar("klanten");
    await laadProjecten();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

// ---------- Filteren en sorteren ----------

function gefilterdeProjecten(statusFilter = "") {
  const term = zoekterm.trim().toLowerCase();
  return projecten.filter((p) => {
    const pastStatus = !statusFilter || p.status === statusFilter;
    const pastZoek = !term || `${p.naam} ${p.klant}`.toLowerCase().includes(term);
    return pastStatus && pastZoek;
  });
}

function sorteer(lijst) {
  const kopie = [...lijst];
  if (sortering === "deadline") {
    // Projecten zonder deadline achteraan
    kopie.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  } else if (sortering === "naam") {
    kopie.sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  } else {
    kopie.sort((a, b) => (b.bijgewerkt || "").localeCompare(a.bijgewerkt || ""));
  }
  return kopie;
}

// ---------- Onderdelen ----------

function statKaart({ label, waarde, icoon, regelLabel, regelWaarde, kleur, kaartKleur = "", filter, linkLabel = "Bekijk projecten", linkNaar = "projecten" }) {
  const linkAttr = linkNaar === "projecten" ? `data-naar-projecten="${filter}"` : `data-naar-pagina="${linkNaar}"`;
  return `
    <article class="stat ${kaartKleur ? `stat--${kaartKleur}` : ""}">
      <div class="stat__top">
        <div class="icon-tile ${kaartKleur ? `icon-tile--${kaartKleur}` : ""}"><i data-lucide="${icoon}"></i></div>
        <div>
          <p class="stat__label">${label}</p>
          <p class="stat__value">${waarde}</p>
        </div>
      </div>
      <div class="stat__row">
        <span class="dot dot--${kleur}"></span>
        <span>${regelLabel}</span>
        <strong class="text--${kleur}">${regelWaarde}</strong>
      </div>
      <button class="stat__link" ${linkAttr}>
        ${linkLabel} <i data-lucide="arrow-right"></i>
      </button>
    </article>
  `;
}

function statusSelect(project) {
  const opties = Object.entries(STATUS)
    .map(([key, s]) => `<option value="${key}" ${key === project.status ? "selected" : ""}>${s.label}</option>`)
    .join("");

  return `
    <label class="status-select">
      <span class="dot dot--${STATUS[project.status].kleur}"></span>
      <select data-status-voor="${esc(project.id)}" aria-label="Status van ${esc(project.naam)}">
        ${opties}
      </select>
      <i data-lucide="chevron-down"></i>
    </label>
  `;
}

function statusPil(project) {
  const s = STATUS[project.status];
  return `<span class="status-pil status-pil--${s.kleur}"><span class="dot dot--${s.kleur}"></span>${s.label}</span>`;
}

function deadlineTekst(project) {
  const dagen = dagenTot(project.deadline);
  if (dagen === null) return `<span class="muted">Geen deadline</span>`;
  if (project.status === "klaar") return `<span class="muted">${korteDatum(project.deadline)}</span>`;
  if (dagen < 0) return `<span class="text--red">${Math.abs(dagen)} dagen te laat</span>`;
  if (dagen === 0) return `<span class="text--red">Vandaag</span>`;
  if (dagen <= 7) return `<span class="text--yellow-dark">Nog ${dagen} ${dagen === 1 ? "dag" : "dagen"}</span>`;
  return `<span class="muted">${korteDatum(project.deadline)}</span>`;
}

function factuurTeLaatTekst(doc, type) {
  if (type !== "factuur" || doc.status === "betaald") return "";
  const dagen = dagenTot(doc.vervaldatum);
  if (dagen === null || dagen >= 0) return "";
  return `<span class="text--red klein">${Math.abs(dagen)} ${Math.abs(dagen) === 1 ? "dag" : "dagen"} te laat</span>`;
}

function avatar(naam, groot = false) {
  return `<span class="avatar ${groot ? "avatar--groot" : ""}" style="background:${avatarKleur(naam)}" aria-hidden="true">${esc(initialen(naam))}</span>`;
}

function projectRij(project) {
  const s = STATUS[project.status];
  return `
    <article class="project">
      <div class="icon-tile icon-tile--${s.kleur}"><i data-lucide="${s.icoon}"></i></div>
      <button class="project__info" data-project="${esc(project.id)}">
        <span class="project__meta">${esc(project.klant || "Geen klant")} · bijgewerkt ${geleden(project.bijgewerkt)}</span>
        <span class="project__naam">${esc(project.naam)}</span>
      </button>
      <div class="project__rechts">
        <p class="project__deadline">${deadlineTekst(project)}</p>
        <div class="project__acties">
          <button class="btn btn--ghost btn--icon" data-open="${esc(project.id)}" title="Open map">
            <i data-lucide="folder-open"></i>
          </button>
          ${statusSelect(project)}
        </div>
      </div>
    </article>
  `;
}

function revisieRij(r) {
  return `
    <article class="project">
      <button class="icon-tile icon-tile--${r.afgehandeld ? "green" : "yellow"}" data-revisie-toggel="${esc(r.id)}" title="${r.afgehandeld ? "Markeer als open" : "Markeer als afgehandeld"}">
        <i data-lucide="${r.afgehandeld ? "circle-check" : "circle"}"></i>
      </button>
      <span class="project__info">
        <span class="project__meta">${korteDatum(r.datum)}</span>
        <span class="project__naam">${esc(r.omschrijving)}</span>
      </span>
      <button class="icon-btn" data-revisie-weg="${esc(r.id)}" title="Verwijderen"><i data-lucide="trash-2"></i></button>
    </article>
  `;
}

// Plaatje bovenaan een kaart: de cover, of een gekleurd vlak als er nog geen is
function kaartBeeld(project, attributen) {
  const kleur = project.stijl?.hoofd || "#E6E6E6";
  const inhoud = project.cover
    ? `<img src="${esc(project.cover)}" alt="" loading="lazy">`
    : `<span class="kaart-beeld__leeg" style="background:${esc(kleur)}"><i data-lucide="image"></i></span>`;
  return `<button class="kaart-beeld" ${attributen} aria-label="Open ${esc(project.naam)}">${inhoud}</button>`;
}

function projectKaart(project) {
  return `
    <article class="pkaart">
      ${kaartBeeld(project, `data-project="${esc(project.id)}"`)}
      <div class="pkaart__body">
        <p class="project__meta">${esc(project.klant || "Geen klant")}</p>
        <button class="pkaart__naam" data-project="${esc(project.id)}">${esc(project.naam)}</button>
        <div class="pkaart__voet">
          ${statusPil(project)}
          <span class="klein">${deadlineTekst(project)}</span>
        </div>
      </div>
    </article>
  `;
}

function stijlgidsKaart(project) {
  const s = project.stijl;
  const id = esc(project.id);

  return `
    <article class="skaart">
      ${kaartBeeld(project, `data-stijlgids-voor="${id}"`)}
      <div class="skaart__body">
        <div>
          <h3 class="skaart__naam">${esc(project.naam)}</h3>
          ${s.slogan ? `<p class="muted klein skaart__slogan">${esc(s.slogan)}</p>` : ""}
        </div>

        <div class="palet-mini" aria-label="Kleuren">
          ${s.kleuren.map((hex) => `<span style="background:${esc(hex)}" title="${esc(hex)}"></span>`).join("")}
        </div>

        <p class="skaart__fonts">
          <i data-lucide="type"></i>
          <span>${s.fonts.map(esc).join(" · ")}</span>
        </p>

        <div class="skaart__acties">
          <a class="btn btn--ghost" href="/projecten/${id}/site/index.html" target="_blank" rel="noopener">
            <i data-lucide="external-link"></i> Website
          </a>
          ${s.pdf ? `
          <a class="btn btn--ghost" href="${esc(s.pdf)}" target="_blank" rel="noopener">
            <i data-lucide="file-text"></i> PDF
          </a>` : ""}
          <button class="btn btn--primary" data-stijlgids-voor="${id}">
            <i data-lucide="pencil-ruler"></i> Bewerken
          </button>
        </div>
      </div>
    </article>
  `;
}

function contactRegels(klant) {
  const regels = [];
  if (klant.email) {
    regels.push(`<li><i data-lucide="mail"></i><a href="mailto:${esc(klant.email)}">${esc(klant.email)}</a></li>`);
  }
  if (klant.telefoon) {
    regels.push(`<li><i data-lucide="phone"></i><a href="tel:${esc(klant.telefoon.replace(/\s/g, ""))}">${esc(klant.telefoon)}</a></li>`);
  }
  if (klant.instagram) {
    regels.push(`<li><i data-lucide="at-sign"></i><a href="https://instagram.com/${esc(klant.instagram)}" target="_blank" rel="noopener">${esc(klant.instagram)}</a></li>`);
  }
  if (klant.website) {
    regels.push(`<li><i data-lucide="globe"></i><a href="${esc(websiteUrl(klant.website))}" target="_blank" rel="noopener">${esc(klant.website.replace(/^https?:\/\//i, ""))}</a></li>`);
  }
  return regels;
}

function klantKaart(klant) {
  const eigen = projectenVanKlant(klant.id);
  const regels = contactRegels(klant);
  const tellers = Object.entries(STATUS)
    .filter(([key]) => tel(key, eigen) > 0)
    .map(([key, s]) => `<span class="status-pil status-pil--${s.kleur} status-pil--klein" title="${s.label}"><span class="dot dot--${s.kleur}"></span>${tel(key, eigen)}</span>`)
    .join("");

  return `
    <article class="kkaart">
      <button class="kkaart__kop" data-klant="${esc(klant.id)}">
        ${avatar(klant.naam)}
        <span class="kkaart__namen">
          <span class="kkaart__naam">${esc(klant.naam)}</span>
          <span class="muted klein">${esc(klant.bedrijf || "Geen bedrijf ingevuld")}</span>
        </span>
      </button>

      ${regels.length
        ? `<ul class="contact-lijst">${regels.join("")}</ul>`
        : `<p class="muted klein">Nog geen contactgegevens.</p>`}

      <div class="kkaart__voet">
        <span class="muted klein">${eigen.length} ${eigen.length === 1 ? "project" : "projecten"}</span>
        <span class="status-tellers">${tellers}</span>
      </div>
    </article>
  `;
}

function bestandKaart(map, bestand) {
  const voorbeeld = isAfbeelding(bestand.naam)
    ? `<img src="${esc(bestand.url)}" alt="" loading="lazy">`
    : `<i data-lucide="${bestandIcoon(bestand.naam)}"></i>`;

  const gemaakt = GEGENEREERD.includes(bestand.naam)
    ? ` · <span class="badge">gemaakt</span>`
    : "";

  return `
    <article class="bestand">
      <a class="bestand__voorbeeld" href="${esc(bestand.url)}" target="_blank" rel="noopener" title="Openen">
        ${voorbeeld}
      </a>
      <div class="bestand__info">
        <div>
          <p class="bestand__naam" title="${esc(bestand.naam)}">${esc(bestand.naam)}</p>
          <p class="muted klein">${formatGrootte(bestand.grootte)}${gemaakt}</p>
        </div>
        <button class="icon-btn bestand__weg" data-verwijder="${esc(map)}" data-naam="${esc(bestand.naam)}" title="Verwijderen">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    </article>
  `;
}

function mapPaneel(key, map, bron) {
  const lijst = bron?.[key];

  let inhoud;
  if (!bron) inhoud = `<p class="muted klein">Laden…</p>`;
  else if (!lijst || !lijst.length) inhoud = `<p class="muted klein">Nog geen bestanden.</p>`;
  else inhoud = `<div class="bestand-grid">${lijst.map((b) => bestandKaart(key, b)).join("")}</div>`;

  return `
    <section class="panel">
      <header class="panel__head">
        <div class="panel__titel">
          <i data-lucide="${map.icoon}"></i>
          <h2>${map.label}</h2>
          ${lijst ? `<span class="teller">${lijst.length}</span>` : ""}
        </div>
        <code>${key}/</code>
      </header>
      ${inhoud}
    </section>
  `;
}

function legeStaat(icoon, titelTekst, uitleg, knop = "") {
  return `
    <div class="leeg">
      <div class="icon-tile"><i data-lucide="${icoon}"></i></div>
      <p><strong>${titelTekst}</strong></p>
      <p class="muted">${uitleg}</p>
      ${knop}
    </div>
  `;
}

// ---------- Pagina's ----------

function renderDashboard() {
  const dezeWeek = projecten.filter((p) => {
    const d = dagenTot(p.deadline);
    return p.status !== "klaar" && d !== null && d >= 0 && d <= 7;
  }).length;

  const klaarDezeMaand = projecten.filter((p) => {
    if (p.status !== "klaar") return false;
    const d = new Date(p.bijgewerkt);
    const nu = new Date();
    return d.getMonth() === nu.getMonth() && d.getFullYear() === nu.getFullYear();
  }).length;

  const zonderDeadline = projecten.filter((p) => p.status === "nog-beginnen" && !p.deadline).length;

  const nu = new Date();
  const betaaldDezeMaand = facturen.filter((f) => {
    if (f.status !== "betaald") return false;
    const d = new Date(f.bijgewerkt);
    return d.getMonth() === nu.getMonth() && d.getFullYear() === nu.getFullYear();
  });
  const omzetDezeMaand = betaaldDezeMaand.reduce((som, f) => som + berekenTotalen(f.regels).totaal, 0);

  const openstaand = facturen.filter((f) => f.status !== "betaald");
  const openstaandBedrag = openstaand.reduce((som, f) => som + berekenTotalen(f.regels).totaal, 0);
  const teLaat = openstaand.filter((f) => {
    const dagen = dagenTot(f.vervaldatum);
    return dagen !== null && dagen < 0;
  });

  const lijst = gefilterdeProjecten(actiefFilter);
  const filterLabel = actiefFilter ? STATUS[actiefFilter].label : "Alle projecten";

  content.innerHTML = `
    <div class="stats">
      ${statKaart({ label: "Totaal projecten", waarde: projecten.length, icoon: "folder",
        regelLabel: "Wacht op klant", regelWaarde: tel("wacht-op-klant"), kleur: "red", filter: "" })}
      ${statKaart({ label: "Bezig", waarde: tel("bezig"), icoon: "loader",
        regelLabel: "Deadline deze week", regelWaarde: dezeWeek, kleur: "blue", kaartKleur: "blue", filter: "bezig" })}
      ${statKaart({ label: "Klaar", waarde: tel("klaar"), icoon: "circle-check",
        regelLabel: "Deze maand", regelWaarde: klaarDezeMaand, kleur: "green", kaartKleur: "green", filter: "klaar" })}
      ${statKaart({ label: "Nog beginnen", waarde: tel("nog-beginnen"), icoon: "clock",
        regelLabel: "Zonder deadline", regelWaarde: zonderDeadline, kleur: "yellow", kaartKleur: "yellow", filter: "nog-beginnen" })}
      ${statKaart({ label: "Omzet deze maand", waarde: euro(omzetDezeMaand), icoon: "trending-up",
        regelLabel: "Facturen betaald", regelWaarde: betaaldDezeMaand.length, kleur: "green", kaartKleur: "green",
        linkLabel: "Bekijk facturen", linkNaar: "facturen" })}
      ${statKaart({ label: "Openstaande facturen", waarde: euro(openstaandBedrag), icoon: "receipt",
        regelLabel: "Te laat", regelWaarde: teLaat.length, kleur: "red",
        linkLabel: "Bekijk facturen", linkNaar: "facturen" })}
    </div>

    <section class="panel">
      <header class="panel__head">
        <div class="panel__titel">
          <h2>${filterLabel}</h2>
          ${actiefFilter ? `<button class="chip" data-filter="">Filter wissen <i data-lucide="x"></i></button>` : ""}
        </div>
        ${magIk("projecten") ? `
        <button class="btn btn--primary" id="nieuw-project">
          <i data-lucide="plus"></i> Nieuw project
        </button>` : ""}
      </header>

      <div class="project-lijst">
        ${lijst.length
          ? lijst.map(projectRij).join("")
          : legeStaat(
              "folder-plus",
              projecten.length ? "Geen projecten gevonden" : "Nog geen projecten",
              projecten.length ? "Probeer een andere zoekterm of filter." : "Maak je eerste project aan. Er wordt meteen een map voor aangemaakt."
            )}
      </div>
    </section>
  `;
}

function renderProjecten() {
  const lijst = sorteer(gefilterdeProjecten(projectFilter));

  const chips = [["", "Alle", projecten.length], ...Object.entries(STATUS).map(([key, s]) => [key, s.label, tel(key)])]
    .map(([key, label, aantal]) => `
      <button class="fchip ${projectFilter === key ? "is-actief" : ""}" data-pfilter="${key}">
        ${key ? `<span class="dot dot--${STATUS[key].kleur}"></span>` : ""}
        ${label}
        <span class="fchip__aantal">${aantal}</span>
      </button>`)
    .join("");

  const sorteerOpties = Object.entries(SORTERINGEN)
    .map(([key, label]) => `<option value="${key}" ${sortering === key ? "selected" : ""}>${label}</option>`)
    .join("");

  content.innerHTML = `
    <div class="toolbar">
      <div class="filter-chips">${chips}</div>
      <div class="toolbar__rechts">
        <label class="select-klein">
          <i data-lucide="arrow-up-down"></i>
          <select id="sortering" aria-label="Sorteren">${sorteerOpties}</select>
        </label>
        ${magIk("projecten") ? `
        <button class="btn btn--primary" id="nieuw-project">
          <i data-lucide="plus"></i> Nieuw project
        </button>` : ""}
      </div>
    </div>

    ${lijst.length
      ? `<div class="kaart-grid">${lijst.map(projectKaart).join("")}</div>`
      : `<section class="panel">${legeStaat(
          "folder-search",
          projecten.length ? "Geen projecten gevonden" : "Nog geen projecten",
          projecten.length ? "Probeer een andere zoekterm of filter." : "Klik op Nieuw project om te beginnen."
        )}</section>`}
  `;
}

function renderStijlgidsen() {
  const term = zoekterm.trim().toLowerCase();
  const metStijl = sorteer(projecten.filter((p) => p.stijl))
    .filter((p) => !term || `${p.naam} ${p.klant} ${p.stijl.fonts.join(" ")}`.toLowerCase().includes(term));

  content.innerHTML = `
    <div class="toolbar">
      <p class="muted">${metStijl.length} ${metStijl.length === 1 ? "stijlgids" : "stijlgidsen"}</p>
    </div>

    ${metStijl.length
      ? `<div class="kaart-grid kaart-grid--breed">${metStijl.map(stijlgidsKaart).join("")}</div>`
      : `<section class="panel">${legeStaat(
          "palette",
          term ? "Geen stijlgidsen gevonden" : "Nog geen stijlgidsen",
          term ? "Probeer een andere zoekterm." : "Elk nieuw project krijgt automatisch een stijlgids. Open een project en klik op Stijlgids bewerken."
        )}</section>`}
  `;
}

function websiteKaart(project) {
  const id = esc(project.id);
  return `
    <article class="skaart">
      ${kaartBeeld(project, `data-project="${id}"`)}
      <div class="skaart__body">
        <div>
          <h3 class="skaart__naam">${esc(project.naam)}</h3>
          <p class="muted klein">${esc(project.klant || "Geen klant")}</p>
        </div>
        <div class="skaart__acties">
          <a class="btn btn--ghost" href="${esc(project.website)}" target="_blank" rel="noopener">
            <i data-lucide="external-link"></i> Bekijk website
          </a>
          <button class="btn btn--primary" data-project="${id}">
            <i data-lucide="folder-open"></i> Open project
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderWebsites() {
  const term = zoekterm.trim().toLowerCase();
  const metWebsite = sorteer(projecten.filter((p) => p.website))
    .filter((p) => !term || `${p.naam} ${p.klant}`.toLowerCase().includes(term));

  content.innerHTML = `
    <div class="toolbar">
      <p class="muted">${metWebsite.length} ${metWebsite.length === 1 ? "website" : "websites"}</p>
    </div>

    ${metWebsite.length
      ? `<div class="kaart-grid kaart-grid--breed">${metWebsite.map(websiteKaart).join("")}</div>`
      : `<section class="panel">${legeStaat(
          "globe",
          term ? "Geen websites gevonden" : "Nog geen websites geüpload",
          term ? "Probeer een andere zoekterm." : "Open een project en upload daar de website die je los hebt gebouwd."
        )}</section>`}
  `;
}

function renderKlanten() {
  const term = zoekterm.trim().toLowerCase();
  const lijst = klanten.filter((k) =>
    !term || `${k.naam} ${k.bedrijf} ${k.email} ${k.instagram}`.toLowerCase().includes(term)
  );

  content.innerHTML = `
    <div class="toolbar">
      <p class="muted">${lijst.length} ${lijst.length === 1 ? "klant" : "klanten"}</p>
      ${magIk("klanten") ? `
      <button class="btn btn--primary" data-nieuwe-klant>
        <i data-lucide="user-plus"></i> Nieuwe klant
      </button>` : ""}
    </div>

    ${lijst.length
      ? `<div class="kaart-grid">${lijst.map(klantKaart).join("")}</div>`
      : `<section class="panel">${legeStaat(
          "users",
          term ? "Geen klanten gevonden" : "Nog geen klanten",
          term ? "Probeer een andere zoekterm." : "Voeg een klant toe, of vul bij een nieuw project een klantnaam in. Dan wordt de klant vanzelf aangemaakt."
        )}</section>`}
  `;
}

function renderKlant() {
  const klant = klanten.find((k) => k.id === openKlantId);

  if (!klant) {
    content.innerHTML = `<section class="panel">${legeStaat(
      "user-x",
      "Klant niet gevonden",
      "Misschien is deze klant verwijderd."
    )}</section>`;
    return;
  }

  const eigen = sorteer(projectenVanKlant(klant.id));
  const regels = contactRegels(klant);
  const eigenOffertes = offertes.filter((o) => o.klantId === klant.id);
  const eigenFacturen = facturen.filter((f) => f.klantId === klant.id);

  content.innerHTML = `
    <button class="terug-link" data-nav="klanten">
      <i data-lucide="arrow-left"></i> Alle klanten
    </button>

    <section class="panel detail">
      <header class="detail__head">
        ${avatar(klant.naam, true)}
        <div class="detail__titel">
          <p class="project__meta">${esc(klant.bedrijf || "Klant")}</p>
          <h2>${esc(klant.naam)}</h2>
        </div>
        <div class="detail__acties">
          <button class="btn btn--ghost" data-klant-open="${esc(klant.id)}">
            <i data-lucide="folder-open"></i> Open map
          </button>
          <button class="btn btn--ghost" data-klant-weg="${esc(klant.id)}">
            <i data-lucide="trash-2"></i> Verwijderen
          </button>
          <button class="btn btn--ghost" data-klant-bewerk>
            <i data-lucide="pencil"></i> Bewerken
          </button>
          ${magIk("facturen") ? `
          <button class="btn btn--ghost" data-klant-offerte>
            <i data-lucide="file-text"></i> Nieuwe offerte
          </button>
          <button class="btn btn--ghost" data-klant-factuur>
            <i data-lucide="file-text"></i> Nieuwe factuur
          </button>` : ""}
          <button class="btn btn--primary" data-klant-project>
            <i data-lucide="plus"></i> Nieuw project
          </button>
        </div>
      </header>

      <div class="klant-info">
        <div>
          <p class="sectie-label">Contact</p>
          ${regels.length
            ? `<ul class="contact-lijst">${regels.join("")}</ul>`
            : `<p class="muted">Nog geen contactgegevens. Klik op Bewerken om ze toe te voegen.</p>`}
        </div>
        <div>
          <p class="sectie-label">Notities</p>
          ${klant.notities
            ? `<p class="notities">${esc(klant.notities)}</p>`
            : `<p class="muted">Geen notities.</p>`}
        </div>
      </div>

      <dl class="info-grid">
        <div><dt>Projecten</dt><dd>${eigen.length}</dd></div>
        <div><dt>Bezig</dt><dd>${tel("bezig", eigen)}</dd></div>
        <div><dt>Klaar</dt><dd>${tel("klaar", eigen)}</dd></div>
        <div><dt>Klant sinds</dt><dd>${korteDatum(klant.aangemaakt)}</dd></div>
      </dl>
    </section>

    <section class="panel">
      <header class="panel__head">
        <div class="panel__titel">
          <i data-lucide="folder"></i>
          <h2>Projecten</h2>
          <span class="teller">${eigen.length}</span>
        </div>
      </header>
      <div class="project-lijst">
        ${eigen.length
          ? eigen.map(projectRij).join("")
          : legeStaat("folder-plus", "Nog geen projecten", `Klik op Nieuw project om iets voor ${esc(klant.naam)} te starten.`)}
      </div>
    </section>

    <section class="panel">
      <header class="panel__head">
        <div class="panel__titel">
          <i data-lucide="file-text"></i>
          <h2>Offertes &amp; facturen</h2>
          <span class="teller">${eigenOffertes.length + eigenFacturen.length}</span>
        </div>
      </header>
      <div class="project-lijst">
        ${eigenOffertes.length || eigenFacturen.length
          ? [...eigenOffertes.map((o) => documentRij(o, "offerte")), ...eigenFacturen.map((f) => documentRij(f, "factuur"))].join("")
          : legeStaat("file-text", "Nog geen offertes of facturen", magIk("facturen") ? `Klik op Nieuwe offerte of Nieuwe factuur hierboven.` : "")}
      </div>
    </section>

    <label class="dropzone" id="dropzone">
      <input type="file" multiple id="upload-input" hidden>
      <div class="icon-tile"><i data-lucide="upload"></i></div>
      <p><strong>Sleep bestanden hierheen</strong> of klik om te kiezen</p>
      <p class="muted klein">Aangeleverde content, contracten, facturen — afbeeldingen gaan naar images, de rest naar documenten.</p>
    </label>

    <div class="mappen">
      ${Object.entries(KLANT_MAPPEN).map(([key, map]) => mapPaneel(key, map, klantBestanden)).join("")}
    </div>
  `;
}

function documentRij(doc, type) {
  const statusMap = type === "factuur" ? FACTUUR_STATUS : OFFERTE_STATUS;
  const s = statusMap[doc.status] || statusMap.concept;
  const klant = klanten.find((k) => k.id === doc.klantId);
  const totalen = berekenTotalen(doc.regels);

  return `
    <article class="project">
      <div class="icon-tile icon-tile--${s.kleur}"><i data-lucide="file-text"></i></div>
      <button class="project__info" data-document-open="${esc(doc.id)}" data-document-type="${type}">
        <span class="project__meta">${esc(klant?.naam || "Onbekende klant")} · ${type === "factuur" ? "factuur" : "offerte"} ${esc(String(doc.nummer))}</span>
        <span class="project__naam">${euro(totalen.totaal)}</span>
      </button>
      <div class="project__rechts">
        ${factuurTeLaatTekst(doc, type)}
        <span class="status-pil status-pil--${s.kleur}"><span class="dot dot--${s.kleur}"></span>${s.label}</span>
      </div>
    </article>
  `;
}

function renderOffertes() {
  content.innerHTML = `
    <div class="toolbar">
      <p class="muted">${offertes.length} ${offertes.length === 1 ? "offerte" : "offertes"}</p>
      ${magIk("facturen") ? `
      <button class="btn btn--primary" data-nieuwe-offerte>
        <i data-lucide="plus"></i> Nieuwe offerte
      </button>` : ""}
    </div>
    <section class="panel">
      <div class="project-lijst">
        ${offertes.length
          ? offertes.map((o) => documentRij(o, "offerte")).join("")
          : legeStaat("file-text", "Nog geen offertes", "Maak een offerte voor een klant.")}
      </div>
    </section>
  `;
}

function renderFacturen() {
  content.innerHTML = `
    <div class="toolbar">
      <p class="muted">${facturen.length} ${facturen.length === 1 ? "factuur" : "facturen"}</p>
      ${magIk("facturen") ? `
      <button class="btn btn--primary" data-nieuwe-factuur>
        <i data-lucide="plus"></i> Nieuwe factuur
      </button>` : ""}
    </div>
    <section class="panel">
      <div class="project-lijst">
        ${facturen.length
          ? facturen.map((f) => documentRij(f, "factuur")).join("")
          : legeStaat("file-text", "Nog geen facturen", "Maak een factuur voor een klant.")}
      </div>
    </section>
  `;
}

// ---------- Prijscalculator ----------

function calculatorRegels() {
  return diensten
    .filter((d) => (calculatorAantallen[d.id] || 0) > 0)
    .map((d) => ({ omschrijving: d.naam, aantal: calculatorAantallen[d.id], prijsPerStuk: d.prijs, btw: d.btw }));
}

function hertekenCalculatorTotalen() {
  const blok = document.querySelector(".totalen-blok");
  if (blok) blok.innerHTML = totalenBlok(berekenTotalen(calculatorRegels()));

  const knop = document.getElementById("calculator-naar-offerte");
  if (knop) knop.disabled = calculatorRegels().length === 0;
}

function dienstRij(dienst) {
  return `
    <div class="dienst-rij">
      <span class="dienst-rij__naam">${esc(dienst.naam)}</span>
      <span class="muted klein">${euro(dienst.prijs)} · BTW ${dienst.btw}%</span>
      <input type="number" min="0" class="ed-input" data-dienst-aantal="${esc(dienst.id)}" value="${calculatorAantallen[dienst.id] || 0}" aria-label="Aantal ${esc(dienst.naam)}">
    </div>
  `;
}

function dienstBeheerRij(dienst) {
  return `
    <article class="project">
      <span class="project__info">
        <span class="project__meta">${euro(dienst.prijs)} · BTW ${dienst.btw}%${dienst.omschrijving ? ` · ${esc(dienst.omschrijving)}` : ""}</span>
        <span class="project__naam">${esc(dienst.naam)}</span>
      </span>
      ${magIk("facturen") ? `
      <div class="project__acties">
        <button class="icon-btn" data-dienst-bewerk="${esc(dienst.id)}" title="Bewerken"><i data-lucide="pencil"></i></button>
        <button class="icon-btn" data-dienst-weg="${esc(dienst.id)}" title="Verwijderen"><i data-lucide="trash-2"></i></button>
      </div>` : ""}
    </article>
  `;
}

function renderPrijscalculator() {
  const klantOpties = `<option value="">Kies een klant</option>` + klanten
    .map((k) => `<option value="${esc(k.id)}" ${k.id === calculatorKlantId ? "selected" : ""}>${esc(k.naam)}</option>`)
    .join("");

  content.innerHTML = `
    <section class="panel">
      <label class="veld">
        <span>Klant</span>
        <select id="calculator-klant">${klantOpties}</select>
      </label>
    </section>

    ${calculatorKlantId ? `
    <section class="panel">
      <p class="sectie-label">Opties</p>
      ${diensten.length
        ? `<div class="dienst-lijst">${diensten.map(dienstRij).join("")}</div>
           <div class="totalen-blok">${totalenBlok(berekenTotalen(calculatorRegels()))}</div>
           <div class="detail__acties">
             <button type="button" class="btn btn--primary" id="calculator-naar-offerte" ${calculatorRegels().length ? "" : "disabled"}>
               <i data-lucide="file-text"></i> Maak offerte van deze berekening
             </button>
           </div>`
        : legeStaat("list-plus", "Nog geen diensten", "Voeg hieronder je eerste dienst toe.")}
    </section>` : `<section class="panel">${legeStaat("user", "Kies eerst een klant", "Dan zie je hier de opties en het totaal.")}</section>`}

    <section class="panel">
      <header class="panel__head">
        <div class="panel__titel">
          <i data-lucide="list-plus"></i>
          <h2>Diensten beheren</h2>
          <span class="teller">${diensten.length}</span>
        </div>
        ${magIk("facturen") ? `
        <button class="btn btn--primary" id="nieuwe-dienst">
          <i data-lucide="plus"></i> Nieuwe dienst
        </button>` : ""}
      </header>
      <div class="project-lijst">
        ${diensten.length
          ? diensten.map(dienstBeheerRij).join("")
          : legeStaat("list-plus", "Nog geen diensten", "Voeg je eerste dienst toe.")}
      </div>
    </section>
  `;
}

function openDienstFormulier(dienst = null) {
  const btwOpties = BTW_TARIEVEN
    .map((t) => `<option value="${t}" ${(dienst ? dienst.btw === t : t === 21) ? "selected" : ""}>${t}%</option>`)
    .join("");

  openModal({
    kop: dienst ? "Dienst bewerken" : "Nieuwe dienst",
    knop: dienst ? "Opslaan" : "Toevoegen",
    inhoud: `
      <label class="veld">
        <span>Naam</span>
        <input name="naam" type="text" placeholder="Bijv. Extra pagina" value="${esc(dienst?.naam || "")}" required>
      </label>
      <div class="veld-rij">
        <label class="veld">
          <span>Prijs (excl. BTW)</span>
          <input name="prijs" type="number" min="0" step="0.01" value="${dienst?.prijs ?? ""}" required>
        </label>
        <label class="veld">
          <span>BTW</span>
          <select name="btw">${btwOpties}</select>
        </label>
      </div>
      <label class="veld">
        <span>Omschrijving (optioneel)</span>
        <input name="omschrijving" type="text" value="${esc(dienst?.omschrijving || "")}">
      </label>
    `,
    opslaan: async (data) => {
      if (dienst) {
        await api(`/api/diensten/${dienst.id}`, { method: "PATCH", body: JSON.stringify(data) });
        toast("Dienst opgeslagen");
      } else {
        await api("/api/diensten", { method: "POST", body: JSON.stringify(data) });
        toast("Dienst toegevoegd");
      }
      await laadDiensten();
    },
  });
}

async function verwijderDienst(id) {
  try {
    await api(`/api/diensten/${id}`, { method: "DELETE" });
    toast("Dienst verwijderd");
    await laadDiensten();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

function regelRij(r, i) {
  return `
    <div class="regel-rij">
      <input type="text" data-regel="${i}" data-eig="omschrijving" value="${esc(r.omschrijving)}" placeholder="Omschrijving" class="ed-input regel-rij__omschrijving">
      <input type="number" min="1" data-regel="${i}" data-eig="aantal" value="${r.aantal}" class="ed-input regel-rij__aantal" aria-label="Aantal">
      <input type="number" step="0.01" data-regel="${i}" data-eig="prijsPerStuk" value="${r.prijsPerStuk}" class="ed-input regel-rij__prijs" aria-label="Prijs per stuk (negatief voor korting)">
      <select data-regel="${i}" data-eig="btw" class="ed-input regel-rij__btw" aria-label="BTW">
        ${BTW_TARIEVEN.map((t) => `<option value="${t}" ${t === r.btw ? "selected" : ""}>${t}%</option>`).join("")}
      </select>
      <button type="button" class="icon-btn" data-regel-weg="${i}" aria-label="Regel verwijderen"><i data-lucide="x"></i></button>
    </div>
  `;
}

function totalenBlok(totalen) {
  return `
    <div><span>Subtotaal</span><strong>${euro(totalen.subtotaal)}</strong></div>
    ${totalen.btwOpbouw.map((t) => `<div><span>BTW ${t.tarief}%</span><strong>${euro(t.btw)}</strong></div>`).join("")}
    <div class="totalen-blok__eind"><span>Totaal</span><strong>${euro(totalen.totaal)}</strong></div>
  `;
}

function hertekenDocumentTotalen() {
  const blok = document.querySelector(".totalen-blok");
  if (blok) blok.innerHTML = totalenBlok(berekenTotalen(bewerkDocument.regels));
}

function renderDocumentEditor() {
  const isFactuur = bewerkType === "factuur";
  const naam = isFactuur ? "Factuur" : "Offerte";
  const pad = isFactuur ? "facturen" : "offertes";
  const statusMap = isFactuur ? FACTUUR_STATUS : OFFERTE_STATUS;

  const klantOpties = `<option value="">Kies een klant</option>` + klanten
    .map((k) => `<option value="${esc(k.id)}" ${k.id === bewerkDocument.klantId ? "selected" : ""}>${esc(k.naam)}</option>`)
    .join("");

  const klantProjecten = projecten.filter((p) => p.klantId === bewerkDocument.klantId);
  const projectOpties = `<option value="">Geen</option>` + klantProjecten
    .map((p) => `<option value="${esc(p.id)}" ${p.id === bewerkDocument.projectId ? "selected" : ""}>${esc(p.naam)}</option>`)
    .join("");

  const statusOpties = Object.entries(statusMap)
    .map(([key, s]) => `<option value="${key}" ${key === bewerkDocument.status ? "selected" : ""}>${s.label}</option>`)
    .join("");

  const kanOmzetten = !isFactuur && bewerkId && !bewerkDocument.omgezetNaarFactuurId;

  content.innerHTML = `
    <button class="terug-link" data-document-terug>
      <i data-lucide="arrow-left"></i> ${isFactuur ? "Facturen" : "Offertes"}
    </button>

    <section class="panel detail">
      <header class="detail__head">
        <div class="detail__titel">
          <p class="project__meta">${naam}</p>
          <h2>${bewerkId ? `${naam} ${esc(String(bewerkDocument.nummer))}` : `Nieuwe ${naam.toLowerCase()}`}</h2>
        </div>
        <div class="detail__acties">
          ${bewerkId ? `
          <a class="btn btn--ghost" href="/api/${pad}/${esc(bewerkId)}/pdf" target="_blank" rel="noopener">
            <i data-lucide="file-text"></i> PDF
          </a>
          ${magIk("facturen") ? `
          <button type="button" class="btn btn--ghost" data-document-weg>
            <i data-lucide="trash-2"></i> Verwijderen
          </button>` : ""}
          <label class="status-select status-select--rol">
            <select data-doc-veld="status">${statusOpties}</select>
            <i data-lucide="chevron-down"></i>
          </label>` : ""}
          ${kanOmzetten ? `
          <button type="button" class="btn btn--primary" data-omzetten>
            <i data-lucide="arrow-right-left"></i> Omzetten naar factuur
          </button>` : ""}
        </div>
      </header>

      <div class="veld-rij">
        <label class="veld">
          <span>Klant</span>
          <select data-doc-veld="klantId">${klantOpties}</select>
        </label>
        <label class="veld">
          <span>Project (optioneel)</span>
          <select data-doc-veld="projectId">${projectOpties}</select>
        </label>
      </div>
      <div class="veld-rij">
        <label class="veld">
          <span>Datum</span>
          <input type="date" data-doc-veld="datum" value="${esc(bewerkDocument.datum)}">
        </label>
        <label class="veld">
          <span>${isFactuur ? "Vervaldatum" : "Geldig tot"}</span>
          <input type="date" data-doc-veld="vervaldatum" value="${esc(bewerkDocument.vervaldatum)}">
          ${isFactuur ? factuurTeLaatTekst(bewerkDocument, "factuur") : ""}
        </label>
      </div>
    </section>

    <section class="panel">
      <p class="sectie-label">Regels</p>
      <div class="regel-lijst">
        ${bewerkDocument.regels.map((r, i) => regelRij(r, i)).join("")}
      </div>
      <button type="button" class="btn btn--ghost ed-erbij" data-regel-erbij>
        <i data-lucide="plus"></i> Regel toevoegen
      </button>
      <p class="muted klein">Tip: voor korting voeg je een regel toe met een negatieve prijs, bijv. "Korting" met -100.</p>

      <div class="totalen-blok">${totalenBlok(berekenTotalen(bewerkDocument.regels))}</div>
    </section>

    <section class="panel">
      <label class="veld">
        <span>Notities</span>
        <textarea rows="3" data-doc-veld="notities" placeholder="Bijv. betalingsvoorwaarden">${esc(bewerkDocument.notities)}</textarea>
      </label>
    </section>

    <div class="detail__acties">
      <button class="btn btn--primary" data-document-opslaan>
        <i data-lucide="save"></i> Opslaan
      </button>
    </div>
  `;
}

function miniPaletFonts(stijl) {
  if (!stijl) return `<p class="muted klein">Laden…</p>`;
  return `
    <div class="palet-mini" aria-label="Kleuren">
      ${stijl.kleuren.map((k) => `<span style="background:${esc(k.hex)}" title="${esc(k.hex)}"></span>`).join("")}
    </div>
    <p class="skaart__fonts">
      <i data-lucide="type"></i>
      <span>${stijl.fonts.map((f) => esc(f.font)).join(" · ")}</span>
    </p>
  `;
}

async function laadGebruikers() {
  try {
    [gebruikers, rechten] = await Promise.all([
      api("/api/gebruikers"),
      api("/api/rechten"),
    ]);
    render();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function laadOffertes() {
  try {
    offertes = await api("/api/offertes");
    render();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function laadFacturen() {
  try {
    facturen = await api("/api/facturen");
    render();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function laadDiensten() {
  try {
    diensten = await api("/api/diensten");
    render();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

// ---------- Offertes en facturen: editor ----------

function nieuweRegel() {
  return { omschrijving: "", aantal: 1, prijsPerStuk: 0, btw: 21 };
}

function openDocumentEditor(type, bestaand = null, voorinvullen = {}) {
  bewerkType = type;
  bewerkId = bestaand?.id || null;
  bewerkDocument = bestaand
    ? { ...bestaand }
    : {
        klantId: voorinvullen.klantId || "",
        projectId: voorinvullen.projectId || null,
        datum: new Date().toISOString().slice(0, 10),
        vervaldatum: "",
        regels: voorinvullen.regels?.length ? voorinvullen.regels : [nieuweRegel()],
        notities: "",
        status: "concept",
      };
  render();
}

function sluitDocumentEditor(naarPagina) {
  bewerkType = null;
  bewerkId = null;
  bewerkDocument = null;
  if (naarPagina) gaNaar(naarPagina);
  else render();
}

async function slaDocumentOp() {
  const pad = bewerkType === "factuur" ? "facturen" : "offertes";
  const naamEnkelvoud = bewerkType === "factuur" ? "Factuur" : "Offerte";

  try {
    if (bewerkId) {
      await api(`/api/${pad}/${bewerkId}`, { method: "PATCH", body: JSON.stringify(bewerkDocument) });
      toast("Opgeslagen");
    } else {
      await api(`/api/${pad}`, { method: "POST", body: JSON.stringify(bewerkDocument) });
      toast(`${naamEnkelvoud} aangemaakt`);
    }
    sluitDocumentEditor(pad);
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function omzetNaarFactuur() {
  try {
    const factuur = await api(`/api/offertes/${bewerkId}/omzetten`, { method: "POST" });
    toast(`Factuur ${factuur.nummer} aangemaakt`);
    await laadFacturen();
    openDocumentEditor("factuur", factuur);
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function verwijderDocument() {
  const pad = bewerkType === "factuur" ? "facturen" : "offertes";
  const naam = bewerkType === "factuur" ? "Factuur" : "Offerte";
  try {
    await api(`/api/${pad}/${bewerkId}`, { method: "DELETE" });
    toast(`${naam} verwijderd`);
    if (pad === "offertes") await laadOffertes(); else await laadFacturen();
    sluitDocumentEditor(pad);
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function wijzigRecht(naam, aan) {
  try {
    rechten = await api("/api/rechten", { method: "PATCH", body: JSON.stringify({ [naam]: aan }) });
    toast("Opgeslagen");
  } catch (fout) {
    toast(fout.message, "fout");
    await laadGebruikers();
  }
}

function rolSelect(gebruiker) {
  const opties = Object.entries(ROLLEN)
    .map(([key, label]) => `<option value="${key}" ${key === gebruiker.rol ? "selected" : ""}>${label}</option>`)
    .join("");

  return `
    <label class="status-select status-select--rol">
      <select data-rol-voor="${esc(gebruiker.id)}" aria-label="Rol van ${esc(gebruiker.naam)}">
        ${opties}
      </select>
      <i data-lucide="chevron-down"></i>
    </label>
  `;
}

function gebruikerRij(gebruiker) {
  const jijzelf = gebruiker.id === ingelogdeGebruiker?.id;

  return `
    <article class="project">
      ${avatar(gebruiker.naam)}
      <span class="project__info">
        <span class="project__meta">${esc(gebruiker.email)}${jijzelf ? " · dit ben jij" : ""}</span>
        <span class="project__naam">${esc(gebruiker.naam)}</span>
      </span>
      <div class="project__rechts">
        <div class="project__acties">
          ${rolSelect(gebruiker)}
          <button class="icon-btn" data-gebruiker-weg="${esc(gebruiker.id)}" title="Verwijderen" ${jijzelf ? "disabled" : ""}>
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderGebruikers() {
  content.innerHTML = `
    <section class="panel">
      <header class="panel__head">
        <div class="panel__titel">
          <i data-lucide="user-cog"></i>
          <h2>Gebruikers</h2>
          <span class="teller">${gebruikers.length}</span>
        </div>
        <button class="btn btn--primary" data-nieuwe-gebruiker>
          <i data-lucide="user-plus"></i> Nieuwe gebruiker
        </button>
      </header>

      <div class="project-lijst">
        ${gebruikers.length
          ? gebruikers.map(gebruikerRij).join("")
          : legeStaat("user-cog", "Nog geen collega's", "Maak een account aan voor iedereen die moet inloggen.")}
      </div>
    </section>

    <section class="panel instellingen-paneel">
      <header class="panel__head">
        <div class="panel__titel"><i data-lucide="shield-check"></i><h2>Rechten voor Medewerker</h2></div>
      </header>
      <p class="muted klein">Beheerders kunnen altijd alles. Hieronder stel je in wat de rol Medewerker mag aanpassen — bekijken kan altijd.</p>

      <div class="rechten-lijst">
        ${rechten ? Object.entries(RECHTEN_LABELS).map(([naam, label]) => `
          <label class="rechten-rij">
            <input type="checkbox" data-recht="${naam}" ${rechten[naam] ? "checked" : ""}>
            <span>${esc(label)}</span>
          </label>
        `).join("") : `<p class="muted klein">Laden…</p>`}
      </div>
    </section>
  `;
}

function openGebruikerFormulier() {
  const rolOpties = Object.entries(ROLLEN)
    .map(([key, label]) => `<option value="${key}" ${key === "medewerker" ? "selected" : ""}>${label}</option>`)
    .join("");

  openModal({
    kop: "Nieuwe gebruiker",
    knop: "Aanmaken",
    inhoud: `
      <label class="veld">
        <span>Naam</span>
        <input name="naam" type="text" required>
      </label>
      <label class="veld">
        <span>E-mail</span>
        <input name="email" type="email" placeholder="naam@bedrijf.nl" required>
      </label>
      <label class="veld">
        <span>Rol</span>
        <select name="rol">${rolOpties}</select>
      </label>
      <label class="veld">
        <span>Tijdelijk wachtwoord</span>
        <input name="wachtwoord" type="password" required minlength="8" autocomplete="new-password">
      </label>
      <p class="muted klein">Geef dit wachtwoord door; de gebruiker kan het na het inloggen zelf wijzigen.</p>
    `,
    opslaan: async (data) => {
      await api("/api/gebruikers", { method: "POST", body: JSON.stringify(data) });
      toast(`${data.naam} aangemaakt`);
      await laadGebruikers();
    },
  });
}

async function wijzigGebruikerRol(id, rol) {
  try {
    await api(`/api/gebruikers/${id}`, { method: "PATCH", body: JSON.stringify({ rol }) });
    toast("Rol aangepast");
    await laadGebruikers();
  } catch (fout) {
    toast(fout.message, "fout");
    await laadGebruikers();
  }
}

async function verwijderGebruiker(id) {
  try {
    await api(`/api/gebruikers/${id}`, { method: "DELETE" });
    toast("Gebruiker verwijderd");
    await laadGebruikers();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

function renderInstellingen() {
  const magBewerken = magIk("instellingen");

  content.innerHTML = `
    <section class="panel instellingen-paneel">
      <header class="panel__head">
        <div class="panel__titel"><i data-lucide="building-2"></i><h2>Studio</h2></div>
      </header>

      <label class="veld">
        <span>Studionaam</span>
        <input class="ed-input" id="studionaam-invoer" type="text" placeholder="studio" value="${esc(instellingen.studionaam)}" ${magBewerken ? "" : "disabled"}>
      </label>

      <div class="instellingen-logo">
        <span class="logo-mark ${instellingen.logo ? "logo-mark--afbeelding" : ""}" style="${instellingen.logo ? `background-image:url('${esc(instellingen.logo)}')` : ""}"></span>
        ${magBewerken ? `
        <div class="instellingen-logo__acties">
          <input type="file" id="logo-invoer" accept=".png,.jpg,.jpeg,.svg,.webp" hidden>
          <button type="button" class="btn btn--ghost" id="logo-kiezen">
            <i data-lucide="upload"></i> Logo uploaden
          </button>
          ${instellingen.logo ? `
          <button type="button" class="btn btn--ghost" id="logo-weg">
            <i data-lucide="trash-2"></i> Verwijderen
          </button>` : ""}
        </div>` : ""}
      </div>
      <p class="muted klein">PNG, JPG, SVG of WEBP, max 5 MB. Vervangt het gekleurde vierkantje in de zijbalk.</p>
    </section>

    <section class="panel instellingen-paneel">
      <header class="panel__head">
        <div class="panel__titel"><i data-lucide="palette"></i><h2>Standaard stijlgids</h2></div>
      </header>
      <p class="muted klein">Nieuwe projecten, en projecten zonder eigen stijlgids, beginnen met deze kleuren, fonts en knoppen.</p>

      <div class="instellingen-voorbeeld">${miniPaletFonts(standaardStijl)}</div>

      ${magBewerken ? `
      <div class="detail__acties">
        <button type="button" class="btn btn--primary" id="standaard-bewerken">
          <i data-lucide="pencil-ruler"></i> Bewerken
        </button>
        <button type="button" class="btn btn--ghost" id="standaard-overnemen">
          <i data-lucide="copy"></i> Overnemen van project
        </button>
        <button type="button" class="btn btn--ghost" id="standaard-reset">
          <i data-lucide="rotate-ccw"></i> Terugzetten naar app-standaard
        </button>
      </div>` : ""}
    </section>

    <section class="panel instellingen-paneel">
      <header class="panel__head">
        <div class="panel__titel"><i data-lucide="hard-drive"></i><h2>Opslag</h2></div>
      </header>

      <dl class="info-grid info-grid--paden">
        <div><dt>Projecten</dt><dd><code>${esc(paden?.projecten || "…")}</code></dd></div>
        <div><dt>Data (klanten, instellingen)</dt><dd><code>${esc(paden?.data || "…")}</code></dd></div>
      </dl>

      <div class="detail__acties">
        <button type="button" class="btn btn--ghost" id="open-projecten-map">
          <i data-lucide="folder-open"></i> Open projecten-map
        </button>
        <button type="button" class="btn btn--ghost" id="open-data-map">
          <i data-lucide="folder-open"></i> Open data-map
        </button>
      </div>
      <p class="muted klein">Maak zelf back-ups: deze mappen staan niet op GitHub.</p>
    </section>

    <section class="panel instellingen-paneel">
      <header class="panel__head">
        <div class="panel__titel"><i data-lucide="receipt"></i><h2>Facturatie</h2></div>
      </header>
      <p class="muted klein">Deze gegevens komen op elke offerte en factuur te staan.</p>

      ${facturatie ? `
      <div class="veld-rij">
        <label class="veld">
          <span>Bedrijfsnaam</span>
          <input class="ed-input" id="fact-bedrijfsnaam" type="text" value="${esc(facturatie.bedrijfsnaam)}" ${magBewerken ? "" : "disabled"}>
        </label>
        <label class="veld">
          <span>IBAN</span>
          <input class="ed-input" id="fact-iban" type="text" value="${esc(facturatie.iban)}" ${magBewerken ? "" : "disabled"}>
        </label>
      </div>
      <label class="veld">
        <span>Adres</span>
        <input class="ed-input" id="fact-adres" type="text" value="${esc(facturatie.adres)}" ${magBewerken ? "" : "disabled"}>
      </label>
      <div class="veld-rij">
        <label class="veld">
          <span>KvK-nummer</span>
          <input class="ed-input" id="fact-kvknummer" type="text" value="${esc(facturatie.kvkNummer)}" ${magBewerken ? "" : "disabled"}>
        </label>
        <label class="veld">
          <span>BTW-nummer</span>
          <input class="ed-input" id="fact-btwnummer" type="text" value="${esc(facturatie.btwNummer)}" ${magBewerken ? "" : "disabled"}>
        </label>
      </div>
      <div class="veld-rij">
        <label class="veld">
          <span>Volgend offertenummer</span>
          <input class="ed-input" id="fact-volgend-offerte" type="number" min="1" value="${facturatie.volgendOffertenummer}" ${magBewerken ? "" : "disabled"}>
        </label>
        <label class="veld">
          <span>Volgend factuurnummer</span>
          <input class="ed-input" id="fact-volgend-factuur" type="number" min="1" value="${facturatie.volgendFactuurnummer}" ${magBewerken ? "" : "disabled"}>
        </label>
      </div>
      ${magBewerken ? `
      <div class="detail__acties">
        <button type="button" class="btn btn--primary" id="fact-opslaan">
          <i data-lucide="save"></i> Opslaan
        </button>
      </div>` : ""}` : `<p class="muted klein">Laden…</p>`}
    </section>
  `;
}

function renderProject() {
  const p = projecten.find((x) => x.id === openProjectId);

  if (!p) {
    content.innerHTML = `<section class="panel">${legeStaat(
      "folder-x",
      "Project niet gevonden",
      "Misschien is de map verplaatst of hernoemd."
    )}</section>`;
    return;
  }

  const s = STATUS[p.status];
  const totaal = bestanden
    ? Object.entries(bestanden)
        .filter(([map]) => map !== "site")
        .reduce((som, [, lijst]) => som + lijst.length, 0)
    : "…";

  const klantLink = p.klantId
    ? `<button class="link-klant" data-klant="${esc(p.klantId)}">${esc(p.klant)}</button>`
    : "Geen klant";

  content.innerHTML = `
    <button class="terug-link" data-nav="${huidigePagina}">
      <i data-lucide="arrow-left"></i> Terug naar ${PAGINAS[huidigePagina]}
    </button>

    <section class="panel detail">
      <header class="detail__head">
        <div class="icon-tile icon-tile--${s.kleur} icon-tile--groot"><i data-lucide="${s.icoon}"></i></div>
        <div class="detail__titel">
          <p class="project__meta">${klantLink}</p>
          <h2>${esc(p.naam)}</h2>
        </div>
        <div class="detail__acties">
          <button class="btn btn--ghost" data-open="${esc(p.id)}">
            <i data-lucide="folder-open"></i> Open map
          </button>
          <button class="btn btn--ghost" data-bewerk>
            <i data-lucide="pencil"></i> Bewerken
          </button>
          ${statusSelect(p)}
        </div>
      </header>

      <dl class="info-grid">
        <div><dt>Deadline</dt><dd>${deadlineTekst(p)}</dd></div>
        <div><dt>Aangemaakt</dt><dd>${korteDatum(p.aangemaakt)}</dd></div>
        <div><dt>Bijgewerkt</dt><dd>${geleden(p.bijgewerkt)}</dd></div>
        <div><dt>Bestanden</dt><dd>${totaal}</dd></div>
      </dl>

      ${p.omschrijving ? `<p class="detail__omschrijving">${esc(p.omschrijving)}</p>` : ""}
    </section>

    <section class="panel stijlgids-kaart">
      <div class="stijlgids-kaart__tekst">
        <div class="icon-tile"><i data-lucide="palette"></i></div>
        <div>
          <h2>Stijlgids en website</h2>
          <p class="muted">Vul de kleuren, fonts en knoppen in. Bij opslaan maakt de app de website en de bestanden in de mappen hieronder.</p>
        </div>
      </div>
      <div class="detail__acties">
        <a class="btn btn--ghost" href="/projecten/${esc(p.id)}/site/index.html" target="_blank" rel="noopener">
          <i data-lucide="external-link"></i> Bekijk website
        </a>
        <button class="btn btn--primary" data-stijlgids>
          <i data-lucide="pencil-ruler"></i> Stijlgids bewerken
        </button>
      </div>
    </section>

    <section class="panel">
      <div class="stijlgids-kaart">
        <div class="stijlgids-kaart__tekst">
          <div class="icon-tile"><i data-lucide="globe"></i></div>
          <div>
            <h2>Website</h2>
            <p class="muted">De echte website die je los bouwt. Upload de map met bestanden om 'm hier te bekijken.</p>
          </div>
        </div>
        <div class="detail__acties">
          ${websiteBestanden?.heeftIndex ? `
          <a class="btn btn--ghost" href="/projecten/${esc(p.id)}/website/index.html" target="_blank" rel="noopener">
            <i data-lucide="external-link"></i> Open in nieuw tabblad
          </a>` : ""}
          ${magIk("projecten") ? `
          <input type="file" webkitdirectory multiple id="website-input" hidden>
          <button type="button" class="btn btn--primary" id="website-kiezen">
            <i data-lucide="upload"></i> ${websiteBestanden?.bestaat ? "Nieuwe versie uploaden" : "Map kiezen"}
          </button>
          ${websiteBestanden?.bestaat ? `
          <button type="button" class="btn btn--ghost" id="website-weg">
            <i data-lucide="trash-2"></i> Verwijderen
          </button>` : ""}` : ""}
        </div>
      </div>

      ${websiteBestanden?.heeftIndex ? `
      <div class="website-voorbeeld">
        <div class="voorbeeld-balk">
          <span class="dot dot--red"></span>
          <span class="dot dot--yellow"></span>
          <span class="dot dot--green"></span>
          <span class="voorbeeld-balk__url">projecten/${esc(p.id)}/website/index.html</span>
        </div>
        <iframe id="website-voorbeeld" title="Voorbeeld van de website" src="/projecten/${esc(p.id)}/website/index.html"></iframe>
      </div>` : websiteBestanden?.bestaat ? `<p class="muted klein">Geen index.html bovenin de map gevonden — er is geen preview te tonen.</p>` : ""}

      ${websiteBestanden?.bestanden?.length ? `
      <ul class="website-bestanden">
        ${websiteBestanden.bestanden.map((b) => `<li><code>${esc(b.pad)}</code> <span class="muted klein">${formatGrootte(b.grootte)}</span></li>`).join("")}
      </ul>` : ""}
    </section>

    <section class="panel">
      <header class="panel__head">
        <div class="panel__titel">
          <i data-lucide="message-square"></i>
          <h2>Feedback &amp; revisies</h2>
          <span class="teller">${(p.revisies || []).filter((r) => !r.afgehandeld).length}</span>
        </div>
      </header>
      ${magIk("projecten") ? `
      <div class="veld-rij">
        <input type="text" class="ed-input" id="revisie-invoer" placeholder="Bijv. Logo iets groter maken" maxlength="500">
        <button type="button" class="btn btn--primary" id="revisie-toevoegen">
          <i data-lucide="plus"></i> Toevoegen
        </button>
      </div>` : ""}
      <div class="project-lijst">
        ${(p.revisies || []).length
          ? p.revisies.map(revisieRij).join("")
          : legeStaat("message-square", "Nog geen feedback", "Voeg hierboven de eerste revisie toe.")}
      </div>
    </section>

    <label class="dropzone" id="dropzone">
      <input type="file" multiple id="upload-input" hidden>
      <div class="icon-tile"><i data-lucide="upload"></i></div>
      <p><strong>Sleep bestanden hierheen</strong> of klik om te kiezen</p>
      <p class="muted klein">Afbeeldingen gaan naar images, de rest naar documenten.</p>
    </label>

    <div class="mappen">
      ${Object.entries(MAPPEN).map(([key, map]) => mapPaneel(key, map, bestanden)).join("")}
    </div>
  `;
}

function renderBinnenkort(naam) {
  content.innerHTML = `<section class="panel">${legeStaat(
    "hammer",
    naam,
    "Deze pagina bouwen we in een volgende stap."
  )}</section>`;
}

function render() {
  if (bewerkType) {
    const naam = bewerkType === "factuur" ? "Factuur" : "Offerte";
    titel.textContent = bewerkId ? `${naam} ${bewerkDocument?.nummer ?? ""}` : `Nieuwe ${naam.toLowerCase()}`;
    renderDocumentEditor();
  } else if (modus === "stijlgids" && stijlgidsBron === "standaard") {
    titel.textContent = "Instellingen · Standaard stijlgids";
    renderEditor();
  } else if (openProjectId) {
    const p = projecten.find((x) => x.id === openProjectId);
    const naam = p ? p.naam : "Project";
    titel.textContent = modus === "stijlgids" ? `${naam} · Stijlgids` : naam;

    if (modus === "stijlgids") renderEditor();
    else renderProject();
  } else if (openKlantId) {
    const k = klanten.find((x) => x.id === openKlantId);
    titel.textContent = k ? k.naam : "Klant";
    renderKlant();
  } else {
    titel.textContent = PAGINAS[huidigePagina];
    if (huidigePagina === "dashboard") renderDashboard();
    else if (huidigePagina === "projecten") renderProjecten();
    else if (huidigePagina === "stijlgidsen") renderStijlgidsen();
    else if (huidigePagina === "websites") renderWebsites();
    else if (huidigePagina === "klanten") renderKlanten();
    else if (huidigePagina === "offertes") renderOffertes();
    else if (huidigePagina === "facturen") renderFacturen();
    else if (huidigePagina === "prijscalculator") renderPrijscalculator();
    else if (huidigePagina === "gebruikers") renderGebruikers();
    else if (huidigePagina === "instellingen") renderInstellingen();
    else renderBinnenkort(PAGINAS[huidigePagina]);
  }

  knopTerug.disabled = !geschiedenis.terug.length;
  knopVooruit.disabled = !geschiedenis.vooruit.length;

  lucide.createIcons();

  if (modus === "stijlgids" && stijlgids) verversVoorbeeld(0);
}

// ---------- Pop-ups ----------

// Algemene pop-up met een formulier
function openModal({ kop, inhoud, knop, opslaan }) {
  const modal = document.createElement("div");
  modal.className = "modal-achtergrond";
  modal.innerHTML = `
    <form class="modal" novalidate>
      <header class="modal__head">
        <h2>${kop}</h2>
        <button type="button" class="icon-btn" data-sluit aria-label="Sluiten"><i data-lucide="x"></i></button>
      </header>
      <div class="modal__body">
        ${inhoud}
        <p class="form-fout" hidden></p>
      </div>
      <footer class="modal__voet">
        <button type="button" class="btn btn--ghost" data-sluit>Annuleren</button>
        <button type="submit" class="btn btn--primary">${knop}</button>
      </footer>
    </form>
  `;

  document.body.appendChild(modal);
  lucide.createIcons();
  modal.querySelector("input, textarea, select")?.focus();

  function opEscape(e) {
    if (e.key === "Escape") sluit();
  }
  function sluit() {
    modal.remove();
    document.removeEventListener("keydown", opEscape);
  }

  document.addEventListener("keydown", opEscape);
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-sluit]")) sluit();
  });

  const form = modal.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const foutEl = modal.querySelector(".form-fout");
    const knopEl = form.querySelector('[type="submit"]');

    // Verplichte velden zelf checken, zodat de foutmelding in de pop-up staat
    const leeg = [...form.querySelectorAll("[required]")].find((v) => !v.value.trim());
    if (leeg) {
      foutEl.textContent = `Vul "${leeg.closest(".veld").querySelector("span").textContent}" in.`;
      foutEl.hidden = false;
      leeg.focus();
      return;
    }

    knopEl.disabled = true;
    try {
      await opslaan(Object.fromEntries(new FormData(form)));
      sluit();
    } catch (fout) {
      foutEl.textContent = fout.message;
      foutEl.hidden = false;
      knopEl.disabled = false;
    }
  });
}

// Project: nieuw of bewerken. "voorinvullen" vult velden alvast in (bijv. de klant)
function openProjectFormulier(project = null, voorinvullen = {}) {
  const bewerken = Boolean(project);
  const waarde = (veld) => esc(project?.[veld] ?? voorinvullen[veld] ?? "");

  const statusOpties = Object.entries(STATUS)
    .map(([key, s]) => `<option value="${key}" ${project?.status === key ? "selected" : ""}>${s.label}</option>`)
    .join("");

  const klantOpties = klanten.map((k) => `<option value="${esc(k.naam)}"></option>`).join("");

  openModal({
    kop: bewerken ? "Project bewerken" : "Nieuw project",
    knop: bewerken ? "Opslaan" : "Project aanmaken",
    inhoud: `
      <label class="veld">
        <span>Projectnaam</span>
        <input name="naam" type="text" placeholder="Bijv. Bloemenwinkel Lisa" value="${waarde("naam")}" required>
      </label>
      <label class="veld">
        <span>Klant</span>
        <input name="klant" type="text" list="klant-lijst" placeholder="Kies of typ een naam" value="${waarde("klant")}" autocomplete="off">
        <datalist id="klant-lijst">${klantOpties}</datalist>
        <small class="muted klein">Nieuwe naam? Dan wordt de klant automatisch aangemaakt.</small>
      </label>
      <div class="veld-rij">
        <label class="veld">
          <span>Status</span>
          <select name="status">${statusOpties}</select>
        </label>
        <label class="veld">
          <span>Deadline</span>
          <input name="deadline" type="date" value="${waarde("deadline")}">
        </label>
      </div>
      <label class="veld">
        <span>Omschrijving</span>
        <textarea name="omschrijving" rows="3" placeholder="Wat ga je maken?">${waarde("omschrijving")}</textarea>
      </label>
      <p class="muted klein">
        ${bewerken
          ? "Let op: de mapnaam blijft hetzelfde, ook als je de projectnaam aanpast."
          : "Er wordt een map aangemaakt met een standaard stijlgids, website en de mappen <code>images</code>, <code>documenten</code> en <code>stijlgids</code>."}
      </p>
    `,
    opslaan: async (data) => {
      if (bewerken) {
        await api(`/api/projecten/${project.id}`, { method: "PATCH", body: JSON.stringify(data) });
        toast("Project opgeslagen");
      } else {
        const nieuw = await api("/api/projecten", { method: "POST", body: JSON.stringify(data) });
        toast(`"${nieuw.naam}" aangemaakt`);
        // De PNG-cover wordt op de achtergrond gemaakt: even later opnieuw ophalen
        setTimeout(laadProjecten, 5000);
      }
      await laadProjecten();
    },
  });
}

// Klant: nieuw of bewerken
function openKlantFormulier(klant = null) {
  const bewerken = Boolean(klant);
  const waarde = (veld) => esc(klant?.[veld] ?? "");

  openModal({
    kop: bewerken ? "Klant bewerken" : "Nieuwe klant",
    knop: bewerken ? "Opslaan" : "Klant toevoegen",
    inhoud: `
      <div class="veld-rij">
        <label class="veld">
          <span>Naam</span>
          <input name="naam" type="text" placeholder="Bijv. Lisa de Vries" value="${waarde("naam")}" required>
        </label>
        <label class="veld">
          <span>Bedrijf</span>
          <input name="bedrijf" type="text" placeholder="Bijv. Bloemenwinkel Lisa" value="${waarde("bedrijf")}">
        </label>
      </div>
      <div class="veld-rij">
        <label class="veld">
          <span>E-mail</span>
          <input name="email" type="email" placeholder="naam@voorbeeld.nl" value="${waarde("email")}">
        </label>
        <label class="veld">
          <span>Telefoon</span>
          <input name="telefoon" type="tel" placeholder="06 12345678" value="${waarde("telefoon")}">
        </label>
      </div>
      <div class="veld-rij">
        <label class="veld">
          <span>Instagram</span>
          <input name="instagram" type="text" placeholder="@gebruikersnaam" value="${waarde("instagram")}">
        </label>
        <label class="veld">
          <span>Website</span>
          <input name="website" type="text" placeholder="www.voorbeeld.nl" value="${waarde("website")}">
        </label>
      </div>
      <label class="veld">
        <span>Notities</span>
        <textarea name="notities" rows="4" placeholder="Wensen, afspraken, hoe je elkaar kent…">${waarde("notities")}</textarea>
      </label>
      ${bewerken ? `<p class="muted klein">Pas je de naam aan, dan wordt die ook in alle projecten van deze klant aangepast.</p>` : ""}
    `,
    opslaan: async (data) => {
      if (bewerken) {
        await api(`/api/klanten/${klant.id}`, { method: "PATCH", body: JSON.stringify(data) });
        toast("Klant opgeslagen");
        await laadProjecten();
      } else {
        const nieuw = await api("/api/klanten", { method: "POST", body: JSON.stringify(data) });
        toast(`${nieuw.naam} toegevoegd`);
        await laadProjecten();
        gaNaar("klanten", null, { klantId: nieuw.id });
      }
    },
  });
}

// ---------- Klikken, slepen en typen ----------

// Menu
document.querySelectorAll(".nav__item[data-page]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    gaNaar(item.dataset.page);
  });
});

// Profiel (zijbalk, buiten #content)
document.getElementById("profiel-knop").addEventListener("click", openWachtwoordFormulier);
document.getElementById("uitlog-knop").addEventListener("click", uitloggen);

// Twee keer klikken om te bevestigen (verwijderen)
function bevestigKlik(knop, actie) {
  if (knop.classList.contains("is-zeker")) return actie();

  const oud = knop.innerHTML;
  knop.classList.add("is-zeker");
  knop.textContent = "Zeker?";
  setTimeout(() => {
    if (!knop.isConnected) return;
    knop.classList.remove("is-zeker");
    knop.innerHTML = oud;
    lucide.createIcons();
  }, 3000);
}

// Alle knoppen in de inhoud
content.addEventListener("click", (e) => {
  // Filter op het dashboard
  const filterKnop = e.target.closest("[data-filter]");
  if (filterKnop) {
    actiefFilter = filterKnop.dataset.filter;
    render();
    return;
  }

  // "Bekijk projecten" op een stat-kaart → pagina Projecten met dat filter
  const naarProjecten = e.target.closest("[data-naar-projecten]");
  if (naarProjecten) {
    projectFilter = naarProjecten.dataset.naarProjecten;
    return gaNaar("projecten");
  }

  const naarPagina = e.target.closest("[data-naar-pagina]");
  if (naarPagina) return gaNaar(naarPagina.dataset.naarPagina);

  // Filter op de pagina Projecten
  const pfilter = e.target.closest("[data-pfilter]");
  if (pfilter) {
    projectFilter = pfilter.dataset.pfilter;
    render();
    return;
  }

  const projectKnop = e.target.closest("[data-project]");
  if (projectKnop) return gaNaar(huidigePagina, projectKnop.dataset.project);

  const stijlgidsKnop = e.target.closest("[data-stijlgids-voor]");
  if (stijlgidsKnop) {
    return gaNaar(huidigePagina, stijlgidsKnop.dataset.stijlgidsVoor, { nieuweModus: "stijlgids" });
  }

  // Klanten
  const klantKnop = e.target.closest("[data-klant]");
  if (klantKnop) return gaNaar("klanten", null, { klantId: klantKnop.dataset.klant });

  if (e.target.closest("[data-nieuwe-klant]")) return openKlantFormulier();

  if (e.target.closest("[data-klant-bewerk]")) {
    return openKlantFormulier(klanten.find((k) => k.id === openKlantId));
  }

  const klantOpenKnop = e.target.closest("[data-klant-open]");
  if (klantOpenKnop) return openKlantMap(klantOpenKnop.dataset.klantOpen);

  if (e.target.closest("[data-klant-project]")) {
    const klant = klanten.find((k) => k.id === openKlantId);
    return openProjectFormulier(null, { klant: klant?.naam || "" });
  }

  if (e.target.closest("[data-klant-offerte]")) return openDocumentEditor("offerte", null, { klantId: openKlantId });
  if (e.target.closest("[data-klant-factuur]")) return openDocumentEditor("factuur", null, { klantId: openKlantId });

  const klantWeg = e.target.closest("[data-klant-weg]");
  if (klantWeg) return bevestigKlik(klantWeg, () => verwijderKlant(klantWeg.dataset.klantWeg));

  // Navigatie en projectacties
  const navKnop = e.target.closest("[data-nav]");
  if (navKnop) return gaNaar(navKnop.dataset.nav);

  const openKnop = e.target.closest("[data-open]");
  if (openKnop) return openMap(openKnop.dataset.open);

  if (e.target.closest("[data-bewerk]")) {
    return openProjectFormulier(projecten.find((p) => p.id === openProjectId));
  }

  if (e.target.closest("[data-stijlgids]")) {
    return gaNaar(huidigePagina, openProjectId, { nieuweModus: "stijlgids" });
  }

  if (e.target.closest("#nieuw-project")) return openProjectFormulier();

  // Gebruikers
  if (e.target.closest("[data-nieuwe-gebruiker]")) return openGebruikerFormulier();

  const gebruikerWeg = e.target.closest("[data-gebruiker-weg]");
  if (gebruikerWeg) return bevestigKlik(gebruikerWeg, () => verwijderGebruiker(gebruikerWeg.dataset.gebruikerWeg));

  // Offertes en facturen
  if (e.target.closest("[data-nieuwe-offerte]")) return openDocumentEditor("offerte");
  if (e.target.closest("[data-nieuwe-factuur]")) return openDocumentEditor("factuur");

  const documentOpen = e.target.closest("[data-document-open]");
  if (documentOpen) {
    const type = documentOpen.dataset.documentType;
    const lijst = type === "factuur" ? facturen : offertes;
    const doc = lijst.find((d) => d.id === documentOpen.dataset.documentOpen);
    return openDocumentEditor(type, doc);
  }

  if (e.target.closest("[data-document-terug]")) return sluitDocumentEditor();
  if (e.target.closest("[data-document-opslaan]")) return slaDocumentOp();
  if (e.target.closest("[data-omzetten]")) return omzetNaarFactuur();

  const documentWeg = e.target.closest("[data-document-weg]");
  if (documentWeg) return bevestigKlik(documentWeg, verwijderDocument);

  // Prijscalculator
  if (e.target.closest("#nieuwe-dienst")) return openDienstFormulier();

  const dienstBewerk = e.target.closest("[data-dienst-bewerk]");
  if (dienstBewerk) return openDienstFormulier(diensten.find((d) => d.id === dienstBewerk.dataset.dienstBewerk));

  const dienstWeg = e.target.closest("[data-dienst-weg]");
  if (dienstWeg) return bevestigKlik(dienstWeg, () => verwijderDienst(dienstWeg.dataset.dienstWeg));

  if (e.target.closest("#calculator-naar-offerte")) {
    return openDocumentEditor("offerte", null, { klantId: calculatorKlantId, regels: calculatorRegels() });
  }

  if (e.target.closest("[data-regel-erbij]")) {
    bewerkDocument.regels.push(nieuweRegel());
    return render();
  }

  const regelWeg = e.target.closest("[data-regel-weg]");
  if (regelWeg) {
    if (bewerkDocument.regels.length <= 1) return toast("Er moet minstens 1 regel zijn.", "fout");
    bewerkDocument.regels.splice(Number(regelWeg.dataset.regelWeg), 1);
    return render();
  }

  // Instellingen
  if (e.target.closest("#standaard-bewerken")) return bewerkStandaardStijlgids();
  if (e.target.closest("#standaard-overnemen")) return openOvernemenFormulier();

  const standaardReset = e.target.closest("#standaard-reset");
  if (standaardReset) return bevestigKlik(standaardReset, resetStandaardStijlgids);

  if (e.target.closest("#logo-kiezen")) return document.getElementById("logo-invoer").click();
  if (e.target.closest("#logo-weg")) return verwijderLogo();

  if (e.target.closest("#website-kiezen")) return document.getElementById("website-input").click();
  const websiteWeg = e.target.closest("#website-weg");
  if (websiteWeg) return bevestigKlik(websiteWeg, verwijderWebsite);

  if (e.target.closest("#revisie-toevoegen")) return probeerRevisieToevoegen();

  const revisieToggel = e.target.closest("[data-revisie-toggel]");
  if (revisieToggel) {
    const r = (projecten.find((p) => p.id === openProjectId)?.revisies || [])
      .find((rev) => rev.id === revisieToggel.dataset.revisieToggel);
    return wijzigRevisie(revisieToggel.dataset.revisieToggel, !r?.afgehandeld);
  }

  const revisieWeg = e.target.closest("[data-revisie-weg]");
  if (revisieWeg) return bevestigKlik(revisieWeg, () => verwijderRevisie(revisieWeg.dataset.revisieWeg));

  if (e.target.closest("#open-projecten-map")) return openOpslagMap("projecten");
  if (e.target.closest("#open-data-map")) return openOpslagMap("data");
  if (e.target.closest("#fact-opslaan")) return slaFacturatieOp();

  // Bestand verwijderen
  const weg = e.target.closest("[data-verwijder]");
  if (weg) {
    const actie = openKlantId ? verwijderKlantBestand : verwijderBestand;
    return bevestigKlik(weg, () => actie(weg.dataset.verwijder, weg.dataset.naam));
  }
});

// Enter in het revisie-invoerveld voegt 'm meteen toe
content.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "revisie-invoer") {
    e.preventDefault();
    probeerRevisieToevoegen();
  }
});

// Dropdowns en bestandskiezer
content.addEventListener("change", (e) => {
  const select = e.target.closest("[data-status-voor]");
  if (select) return wijzigStatus(select.dataset.statusVoor, select.value);

  const rolSelectEl = e.target.closest("[data-rol-voor]");
  if (rolSelectEl) return wijzigGebruikerRol(rolSelectEl.dataset.rolVoor, rolSelectEl.value);

  const rechtVink = e.target.closest("[data-recht]");
  if (rechtVink) return wijzigRecht(rechtVink.dataset.recht, rechtVink.checked);

  if (e.target.id === "sortering") {
    sortering = e.target.value;
    return render();
  }

  if (e.target.id === "upload-input") {
    (openKlantId ? uploadKlantBestanden : uploadBestanden)(e.target.files);
    e.target.value = "";
  }

  if (e.target.id === "studionaam-invoer") return slaStudionaamOp(e.target.value);

  if (e.target.id === "logo-invoer") {
    uploadLogo(e.target.files[0]);
    e.target.value = "";
  }

  if (e.target.id === "website-input") {
    uploadWebsiteBestanden(e.target.files);
    e.target.value = "";
  }

  if (e.target.id === "calculator-klant") {
    calculatorKlantId = e.target.value;
    return render();
  }

  const docVeld = e.target.closest("[data-doc-veld]");
  if (docVeld) {
    bewerkDocument[docVeld.dataset.docVeld] = docVeld.value;
    if (docVeld.dataset.docVeld === "klantId") bewerkDocument.projectId = null;
    return render();
  }

  if (e.target.dataset.regel !== undefined && e.target.dataset.eig === "btw") {
    bewerkDocument.regels[Number(e.target.dataset.regel)].btw = Number(e.target.value);
    return hertekenDocumentTotalen();
  }
});

// Regel-velden van offertes/facturen: direct bijwerken en totalen herberekenen
content.addEventListener("input", (e) => {
  if (e.target.dataset.dienstAantal !== undefined) {
    calculatorAantallen[e.target.dataset.dienstAantal] = Number(e.target.value) || 0;
    return hertekenCalculatorTotalen();
  }

  if (!bewerkType || e.target.dataset.regel === undefined) return;
  const regel = bewerkDocument.regels[Number(e.target.dataset.regel)];
  const eig = e.target.dataset.eig;

  if (eig === "aantal" || eig === "prijsPerStuk") regel[eig] = Number(e.target.value) || 0;
  else regel[eig] = e.target.value;

  hertekenDocumentTotalen();
});

// Slepen naar het uploadvlak
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

content.addEventListener("dragover", (e) => {
  const zone = e.target.closest("#dropzone");
  if (zone) zone.classList.add("is-over");
});

content.addEventListener("dragleave", (e) => {
  const zone = e.target.closest("#dropzone");
  if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("is-over");
});

content.addEventListener("drop", (e) => {
  const zone = e.target.closest("#dropzone");
  if (!zone) return;
  zone.classList.remove("is-over");
  (openKlantId ? uploadKlantBestanden : uploadBestanden)(e.dataTransfer.files);
});

// Zoeken: werkt op Dashboard, Projecten, Stijlgidsen en Klanten
zoekveld.addEventListener("input", () => {
  zoekterm = zoekveld.value;
  if (openProjectId || openKlantId) {
    gaNaar(openKlantId ? "klanten" : "projecten");
  } else if (["dashboard", "projecten", "stijlgidsen", "klanten"].includes(huidigePagina)) {
    render();
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    zoekveld.focus();
  }
});

// ---------- Start ----------
// Wacht tot editor.js ook geladen is
window.addEventListener("DOMContentLoaded", async () => {
  await laadSessie();
  if (!ingelogdeGebruiker) return; // al doorgestuurd naar /login.html

  laadProjecten();
  laadInstellingen();
  laadPaden();
  laadOffertes();
  laadFacturen();
  laadDiensten();
});