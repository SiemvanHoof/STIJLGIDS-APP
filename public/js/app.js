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
  klanten:      "Klanten",
  instellingen: "Instellingen",
};

const MAPPEN = {
  images:     { label: "Afbeeldingen", icoon: "image" },
  documenten: { label: "Documenten",   icoon: "file-text" },
  stijlgids:  { label: "Stijlgids",    icoon: "palette" },
};

let projecten = [];
let huidigePagina = "dashboard";
let openProjectId = null;
let bestanden = null;
let zoekterm = "";
let actiefFilter = "";
let modus = "project"; // "project" of "stijlgids"

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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.fout || "Er ging iets mis.");
  return data;
}

function esc(tekst) {
  return String(tekst ?? "").replace(/[&<>"']/g, (t) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[t]));
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

function tel(status) {
  return projecten.filter((p) => p.status === status).length;
}

function toast(tekst, soort = "ok") {
  const el = document.createElement("div");
  el.className = `toast toast--${soort}`;
  el.textContent = tekst;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("is-weg"), 2200);
  setTimeout(() => el.remove(), 2600);
}

// ---------- Navigatie ----------

function huidigeStand() {
  return { pagina: huidigePagina, projectId: openProjectId, modus };
}

function gaNaar(pagina, projectId = null, { opslaan = true, nieuweModus = "project" } = {}) {
  if (opslaan) {
    geschiedenis.terug.push(huidigeStand());
    geschiedenis.vooruit = [];
  }

  huidigePagina = pagina;
  openProjectId = projectId;
  modus = projectId ? nieuweModus : "project";
  bestanden = null;
  stijlgids = null;

  document.querySelectorAll(".nav__item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.page === pagina);
  });

  render();
  if (projectId && modus === "project") laadBestanden();
  if (projectId && modus === "stijlgids") laadStijlgids();
  window.scrollTo(0, 0);
}

knopTerug.addEventListener("click", () => {
  const vorige = geschiedenis.terug.pop();
  if (!vorige) return;
  geschiedenis.vooruit.push(huidigeStand());
  gaNaar(vorige.pagina, vorige.projectId, { opslaan: false, nieuweModus: vorige.modus });
});

knopVooruit.addEventListener("click", () => {
  const volgende = geschiedenis.vooruit.pop();
  if (!volgende) return;
  geschiedenis.terug.push(huidigeStand());
  gaNaar(volgende.pagina, volgende.projectId, { opslaan: false, nieuweModus: volgende.modus });
});

// ---------- Data ----------

async function laadProjecten() {
  try {
    projecten = await api("/api/projecten");
  } catch (fout) {
    toast(fout.message, "fout");
  }
  render();
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

// ---------- Onderdelen ----------

function statKaart({ label, waarde, icoon, regelLabel, regelWaarde, kleur, filter }) {
  return `
    <article class="stat">
      <div class="stat__top">
        <div class="icon-tile"><i data-lucide="${icoon}"></i></div>
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
      <button class="stat__link" data-filter="${filter}">
        Bekijk projecten <i data-lucide="arrow-right"></i>
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

function deadlineTekst(project) {
  const dagen = dagenTot(project.deadline);
  if (dagen === null) return `<span class="muted">Geen deadline</span>`;
  if (project.status === "klaar") return `<span class="muted">${korteDatum(project.deadline)}</span>`;
  if (dagen < 0) return `<span class="text--red">${Math.abs(dagen)} dagen te laat</span>`;
  if (dagen === 0) return `<span class="text--red">Vandaag</span>`;
  if (dagen <= 7) return `<span class="text--yellow-dark">Nog ${dagen} ${dagen === 1 ? "dag" : "dagen"}</span>`;
  return `<span class="muted">${korteDatum(project.deadline)}</span>`;
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

function gefilterdeProjecten(statusFilter = "") {
  const term = zoekterm.trim().toLowerCase();
  return projecten.filter((p) => {
    const pastStatus = !statusFilter || p.status === statusFilter;
    const pastZoek = !term || `${p.naam} ${p.klant}`.toLowerCase().includes(term);
    return pastStatus && pastZoek;
  });
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

function mapPaneel(key, map) {
  const lijst = bestanden?.[key];

  let inhoud;
  if (!bestanden) inhoud = `<p class="muted klein">Laden…</p>`;
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

  const lijst = gefilterdeProjecten(actiefFilter);
  const filterLabel = actiefFilter ? STATUS[actiefFilter].label : "Alle projecten";

  content.innerHTML = `
    <div class="stats">
      ${statKaart({ label: "Totaal projecten", waarde: projecten.length, icoon: "folder",
        regelLabel: "Wacht op klant", regelWaarde: tel("wacht-op-klant"), kleur: "red", filter: "" })}
      ${statKaart({ label: "Bezig", waarde: tel("bezig"), icoon: "loader",
        regelLabel: "Deadline deze week", regelWaarde: dezeWeek, kleur: "blue", filter: "bezig" })}
      ${statKaart({ label: "Klaar", waarde: tel("klaar"), icoon: "circle-check",
        regelLabel: "Deze maand", regelWaarde: klaarDezeMaand, kleur: "green", filter: "klaar" })}
      ${statKaart({ label: "Nog beginnen", waarde: tel("nog-beginnen"), icoon: "clock",
        regelLabel: "Zonder deadline", regelWaarde: zonderDeadline, kleur: "yellow", filter: "nog-beginnen" })}
    </div>

    <section class="panel">
      <header class="panel__head">
        <div class="panel__titel">
          <h2>${filterLabel}</h2>
          ${actiefFilter ? `<button class="chip" data-filter="">Filter wissen <i data-lucide="x"></i></button>` : ""}
        </div>
        <button class="btn btn--primary" id="nieuw-project">
          <i data-lucide="plus"></i> Nieuw project
        </button>
      </header>

      <div class="project-lijst">
        ${lijst.length
          ? lijst.map(projectRij).join("")
          : `<div class="leeg">
               <div class="icon-tile"><i data-lucide="folder-plus"></i></div>
               <p><strong>${projecten.length ? "Geen projecten gevonden" : "Nog geen projecten"}</strong></p>
               <p class="muted">${projecten.length ? "Probeer een andere zoekterm of filter." : "Maak je eerste project aan. Er wordt meteen een map voor aangemaakt."}</p>
             </div>`}
      </div>
    </section>
  `;
}

function renderProject() {
  const p = projecten.find((x) => x.id === openProjectId);

  if (!p) {
    content.innerHTML = `
      <section class="panel">
        <div class="leeg">
          <div class="icon-tile"><i data-lucide="folder-x"></i></div>
          <p><strong>Project niet gevonden</strong></p>
          <p class="muted">Misschien is de map verplaatst of hernoemd.</p>
        </div>
      </section>`;
    return;
  }

  const s = STATUS[p.status];
  const totaal = bestanden
    ? Object.entries(bestanden)
        .filter(([map]) => map !== "site")
        .reduce((som, [, lijst]) => som + lijst.length, 0)
    : "…";

  content.innerHTML = `
    <button class="terug-link" data-nav="dashboard">
      <i data-lucide="arrow-left"></i> Alle projecten
    </button>

    <section class="panel detail">
      <header class="detail__head">
        <div class="icon-tile icon-tile--${s.kleur} icon-tile--groot"><i data-lucide="${s.icoon}"></i></div>
        <div class="detail__titel">
          <p class="project__meta">${esc(p.klant || "Geen klant")}</p>
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

    <label class="dropzone" id="dropzone">
      <input type="file" multiple id="upload-input" hidden>
      <div class="icon-tile"><i data-lucide="upload"></i></div>
      <p><strong>Sleep bestanden hierheen</strong> of klik om te kiezen</p>
      <p class="muted klein">Afbeeldingen gaan naar images, de rest naar documenten.</p>
    </label>

    <div class="mappen">
      ${Object.entries(MAPPEN).map(([key, map]) => mapPaneel(key, map)).join("")}
    </div>
  `;
}

function renderBinnenkort(naam) {
  content.innerHTML = `
    <section class="panel">
      <div class="leeg">
        <div class="icon-tile"><i data-lucide="hammer"></i></div>
        <p><strong>${naam}</strong></p>
        <p class="muted">Deze pagina bouwen we in een volgende stap.</p>
      </div>
    </section>
  `;
}

function render() {
  if (openProjectId) {
    const p = projecten.find((x) => x.id === openProjectId);
    const naam = p ? p.naam : "Project";
    titel.textContent = modus === "stijlgids" ? `${naam} · Stijlgids` : naam;

    if (modus === "stijlgids") renderEditor();
    else renderProject();
  } else {
    titel.textContent = PAGINAS[huidigePagina];
    if (huidigePagina === "dashboard") renderDashboard();
    else renderBinnenkort(PAGINAS[huidigePagina]);
  }

  knopTerug.disabled = !geschiedenis.terug.length;
  knopVooruit.disabled = !geschiedenis.vooruit.length;

  lucide.createIcons();

  if (openProjectId && modus === "stijlgids" && stijlgids) verversVoorbeeld(0);
}

// ---------- Projectformulier (nieuw + bewerken) ----------

function openProjectFormulier(project = null) {
  const bewerken = Boolean(project);
  const waarde = (veld) => esc(project?.[veld] ?? "");

  const opties = Object.entries(STATUS)
    .map(([key, s]) => `<option value="${key}" ${project?.status === key ? "selected" : ""}>${s.label}</option>`)
    .join("");

  const modal = document.createElement("div");
  modal.className = "modal-achtergrond";
  modal.innerHTML = `
    <form class="modal">
      <header class="modal__head">
        <h2>${bewerken ? "Project bewerken" : "Nieuw project"}</h2>
        <button type="button" class="icon-btn" data-sluit aria-label="Sluiten"><i data-lucide="x"></i></button>
      </header>

      <div class="modal__body">
        <label class="veld">
          <span>Projectnaam</span>
          <input name="naam" type="text" placeholder="Bijv. Bloemenwinkel Lisa" value="${waarde("naam")}" required>
        </label>
        <label class="veld">
          <span>Klant</span>
          <input name="klant" type="text" placeholder="Naam van de klant" value="${waarde("klant")}">
        </label>
        <div class="veld-rij">
          <label class="veld">
            <span>Status</span>
            <select name="status">${opties}</select>
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
        <p class="form-fout" hidden></p>
      </div>

      <footer class="modal__voet">
        <button type="button" class="btn btn--ghost" data-sluit>Annuleren</button>
        <button type="submit" class="btn btn--primary">${bewerken ? "Opslaan" : "Project aanmaken"}</button>
      </footer>
    </form>
  `;

  document.body.appendChild(modal);
  lucide.createIcons();
  modal.querySelector('[name="naam"]').focus();

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

  modal.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const foutEl = modal.querySelector(".form-fout");

    try {
      if (bewerken) {
        const bijgewerkt = await api(`/api/projecten/${project.id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        projecten = projecten.map((p) => (p.id === project.id ? { ...p, ...bijgewerkt } : p));
        toast("Project opgeslagen");
      } else {
        const nieuw = await api("/api/projecten", { method: "POST", body: JSON.stringify(data) });
        projecten.unshift(nieuw);
        toast(`"${nieuw.naam}" aangemaakt`);
      }
      sluit();
      render();
    } catch (fout) {
      foutEl.textContent = fout.message;
      foutEl.hidden = false;
    }
  });
}

// ---------- Klikken, slepen en typen ----------

// Menu
document.querySelectorAll(".nav__item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    gaNaar(item.dataset.page);
  });
});

// Alle knoppen in de inhoud
content.addEventListener("click", (e) => {
  const filterKnop = e.target.closest("[data-filter]");
  if (filterKnop) {
    actiefFilter = filterKnop.dataset.filter;
    render();
    return;
  }

  const projectKnop = e.target.closest("[data-project]");
  if (projectKnop) return gaNaar(huidigePagina, projectKnop.dataset.project);

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

  // Verwijderen: eerste klik vraagt bevestiging, tweede klik verwijdert
  const weg = e.target.closest("[data-verwijder]");
  if (weg) {
    if (weg.classList.contains("is-zeker")) {
      verwijderBestand(weg.dataset.verwijder, weg.dataset.naam);
    } else {
      weg.classList.add("is-zeker");
      weg.textContent = "Zeker?";
      setTimeout(() => {
        if (!weg.isConnected) return;
        weg.classList.remove("is-zeker");
        weg.innerHTML = `<i data-lucide="trash-2"></i>`;
        lucide.createIcons();
      }, 3000);
    }
  }
});

// Dropdowns en bestandskiezer
content.addEventListener("change", (e) => {
  const select = e.target.closest("[data-status-voor]");
  if (select) return wijzigStatus(select.dataset.statusVoor, select.value);

  if (e.target.id === "upload-input") {
    uploadBestanden(e.target.files);
    e.target.value = "";
  }
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
  uploadBestanden(e.dataTransfer.files);
});

// Zoeken
zoekveld.addEventListener("input", () => {
  zoekterm = zoekveld.value;
  if (openProjectId) gaNaar("dashboard");
  else if (huidigePagina === "dashboard") render();
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    zoekveld.focus();
  }
});

// ---------- Start ----------
// Wacht tot editor.js ook geladen is
window.addEventListener("DOMContentLoaded", laadProjecten);