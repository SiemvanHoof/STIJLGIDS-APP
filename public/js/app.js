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

let projecten = [];
let huidigePagina = "dashboard";
let zoekterm = "";

const content = document.getElementById("content");
const titel = document.getElementById("page-title");
const zoekveld = document.getElementById("search");

// ---------- Hulpfuncties ----------

// Praat met de server
async function api(url, opties = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opties,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.fout || "Er ging iets mis.");
  return data;
}

// Voorkomt dat tekst als HTML wordt uitgevoerd
function esc(tekst) {
  return String(tekst ?? "").replace(/[&<>"']/g, (t) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[t]));
}

// "2 dagen geleden"
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
  return new Date(datum).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

// "14 okt"
function korteDatum(datum) {
  if (!datum) return "";
  return new Date(datum).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

// Aantal dagen tot de deadline (negatief = te laat)
function dagenTot(datum) {
  if (!datum) return null;
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  return Math.round((new Date(datum) - vandaag) / 86400000);
}

function tel(status) {
  return projecten.filter((p) => p.status === status).length;
}

// Melding rechtsonder
function toast(tekst, soort = "ok") {
  const el = document.createElement("div");
  el.className = `toast toast--${soort}`;
  el.textContent = tekst;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("is-weg"), 2200);
  setTimeout(() => el.remove(), 2600);
}

// ---------- Data ----------

async function laadProjecten() {
  try {
    projecten = await api("/api/projecten");
  } catch (fout) {
    toast(fout.message, "fout");
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
    <label class="status-select status-select--${STATUS[project.status].kleur}">
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
  if (project.status === "klaar") return `<span class="muted">Deadline ${korteDatum(project.deadline)}</span>`;
  if (dagen < 0) return `<span class="text--red">${Math.abs(dagen)} dagen te laat</span>`;
  if (dagen === 0) return `<span class="text--red">Vandaag</span>`;
  if (dagen <= 7) return `<span class="text--yellow-dark">Nog ${dagen} ${dagen === 1 ? "dag" : "dagen"}</span>`;
  return `<span class="muted">Deadline ${korteDatum(project.deadline)}</span>`;
}

function projectRij(project) {
  const s = STATUS[project.status];
  return `
    <article class="project">
      <div class="icon-tile icon-tile--${s.kleur}"><i data-lucide="${s.icoon}"></i></div>
      <div class="project__info">
        <p class="project__meta">${esc(project.klant || "Geen klant")} · bijgewerkt ${geleden(project.bijgewerkt)}</p>
        <h3 class="project__naam">${esc(project.naam)}</h3>
      </div>
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

// ---------- Pagina's ----------

let actiefFilter = "";

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
  titel.textContent = PAGINAS[huidigePagina];

  if (huidigePagina === "dashboard") renderDashboard();
  else renderBinnenkort(PAGINAS[huidigePagina]);

  lucide.createIcons();
}

// ---------- Nieuw project (pop-up) ----------

function openNieuwProject() {
  const opties = Object.entries(STATUS)
    .map(([key, s]) => `<option value="${key}">${s.label}</option>`)
    .join("");

  const modal = document.createElement("div");
  modal.className = "modal-achtergrond";
  modal.innerHTML = `
    <form class="modal" id="project-form">
      <header class="modal__head">
        <h2>Nieuw project</h2>
        <button type="button" class="icon-btn" data-sluit aria-label="Sluiten"><i data-lucide="x"></i></button>
      </header>

      <div class="modal__body">
        <label class="veld">
          <span>Projectnaam</span>
          <input name="naam" type="text" placeholder="Bijv. Bloemenwinkel Lisa" required>
        </label>
        <label class="veld">
          <span>Klant</span>
          <input name="klant" type="text" placeholder="Naam van de klant">
        </label>
        <div class="veld-rij">
          <label class="veld">
            <span>Status</span>
            <select name="status">${opties}</select>
          </label>
          <label class="veld">
            <span>Deadline</span>
            <input name="deadline" type="date">
          </label>
        </div>
        <label class="veld">
          <span>Omschrijving</span>
          <textarea name="omschrijving" rows="3" placeholder="Wat ga je maken?"></textarea>
        </label>
        <p class="muted klein">Er wordt een map aangemaakt met <code>site</code>, <code>images</code>, <code>documenten</code> en <code>stijlgids</code>.</p>
        <p class="form-fout" hidden></p>
      </div>

      <footer class="modal__voet">
        <button type="button" class="btn btn--ghost" data-sluit>Annuleren</button>
        <button type="submit" class="btn btn--primary">Project aanmaken</button>
      </footer>
    </form>
  `;

  document.body.appendChild(modal);
  lucide.createIcons();
  modal.querySelector('[name="naam"]').focus();

  const sluit = () => modal.remove();

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-sluit]")) sluit();
  });

  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") {
      sluit();
      document.removeEventListener("keydown", esc);
    }
  });

  modal.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const foutEl = modal.querySelector(".form-fout");

    try {
      const nieuw = await api("/api/projecten", { method: "POST", body: JSON.stringify(data) });
      projecten.unshift(nieuw);
      sluit();
      toast(`"${nieuw.naam}" aangemaakt`);
      render();
    } catch (fout) {
      foutEl.textContent = fout.message;
      foutEl.hidden = false;
    }
  });
}

// ---------- Klikken en typen ----------

// Menu
document.querySelectorAll(".nav__item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".nav__item").forEach((i) => i.classList.remove("is-active"));
    item.classList.add("is-active");
    huidigePagina = item.dataset.page;
    render();
  });
});

// Knoppen in de inhoud
content.addEventListener("click", (e) => {
  const filterKnop = e.target.closest("[data-filter]");
  if (filterKnop) {
    actiefFilter = filterKnop.dataset.filter;
    render();
    return;
  }

  const openKnop = e.target.closest("[data-open]");
  if (openKnop) return openMap(openKnop.dataset.open);

  if (e.target.closest("#nieuw-project")) openNieuwProject();
});

// Status-dropdowns
content.addEventListener("change", (e) => {
  const select = e.target.closest("[data-status-voor]");
  if (select) wijzigStatus(select.dataset.statusVoor, select.value);
});

// Zoeken
zoekveld.addEventListener("input", () => {
  zoekterm = zoekveld.value;
  if (huidigePagina === "dashboard") render();
});

// Ctrl/Cmd + F = zoekveld
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    zoekveld.focus();
  }
});

// ---------- Start ----------
laadProjecten();