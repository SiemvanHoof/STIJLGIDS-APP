// =========================================
// Stijlgids-editor
// =========================================

const GEGENEREERD = [
  "cover.svg", "cover.png",
  "kleurenpalet.svg", "kleurenpalet.png",
  "stijlgids.json", "variabelen.css", "stijlgids.pdf",
];

const FONT_SUGGESTIES = [
  "Bodoni Moda", "Playfair Display", "Cormorant Garamond", "DM Serif Display", "Fraunces", "Libre Caslon Text",
  "Pinyon Script", "Great Vibes", "Allura", "Parisienne", "Homemade Apple", "Caveat",
  "Courier Prime", "Space Mono", "IBM Plex Mono", "Inter", "Montserrat", "Poppins",
  "Work Sans", "Karla", "Lora", "Instrument Sans",
];

const FONT_VELDEN = [
  ["koppen", "Koppen"],
  ["sier", "Sierletter"],
  ["tekst", "Tekst"],
  ["logo", "Logo"],
  ["hand", "Handschrift"],
];

const KLEUR_ROLLEN = [
  ["achtergrond", "Achtergrond"],
  ["tekst", "Tekst"],
  ["hoofd", "Hoofdkleur"],
  ["tweede", "Tweede kleur"],
];

let stijlgids = null;
let stijlgidsGewijzigd = false;
let voorbeeldTimer = null;
const dichtePanelen = new Set();

// ---------- Laden en opslaan ----------

async function laadStijlgids() {
  stijlgids = null;
  render();
  try {
    stijlgids = await api(`/api/projecten/${openProjectId}/stijlgids`);
    stijlgidsGewijzigd = false;
    render();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function slaStijlgidsOp() {
  const knop = document.querySelector("[data-stijlgids-opslaan]");
  if (knop) {
    knop.disabled = true;
    knop.innerHTML = `<i data-lucide="loader"></i> Bestanden maken…`;
    lucide.createIcons();
  }

  try {
    const res = await api(`/api/projecten/${openProjectId}/stijlgids`, {
      method: "PUT",
      body: JSON.stringify(stijlgids),
    });
    stijlgids = res.data;
    stijlgidsGewijzigd = false;

    if (res.waarschuwing) toast(res.waarschuwing, "fout");
    else toast(`Opgeslagen: ${res.bestanden.length} bestanden gemaakt`);

    await laadProjecten();
  } catch (fout) {
    toast(fout.message, "fout");
    if (knop && knop.isConnected) {
      knop.disabled = false;
      knop.innerHTML = `<i data-lucide="save"></i> Opslaan en bestanden maken`;
      lucide.createIcons();
    }
  }
}

function markeerGewijzigd() {
  stijlgidsGewijzigd = true;
  const status = document.getElementById("opslaan-status");
  if (status) status.textContent = "Niet opgeslagen wijzigingen";
}

// ---------- Live voorbeeld ----------

function verversVoorbeeld(wacht = 350) {
  clearTimeout(voorbeeldTimer);
  voorbeeldTimer = setTimeout(async () => {
    const iframe = document.getElementById("voorbeeld");
    if (!iframe || !stijlgids) return;

    try {
      const res = await fetch("/api/stijlgids/voorbeeld", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stijlgids),
      });
      const html = await res.text();
      const scroll = iframe.contentWindow?.scrollY || 0;
      iframe.onload = () => iframe.contentWindow.scrollTo(0, scroll);
      iframe.srcdoc = html;
    } catch {
      toast("Het voorbeeld kon niet laden.", "fout");
    }
  }, wacht);
}

// ---------- Onderdelen ----------

function radiusNaarSchuif(radius) {
  return radius >= 999 ? 41 : radius;
}

function radiusTekst(radius) {
  if (radius >= 999) return "Pil";
  if (radius === 0) return "Recht";
  return `${radius}px`;
}

function rolOpties(rol) {
  return stijlgids.kleuren
    .map((k, i) => `<option value="${i}" ${stijlgids.rollen[rol] === i ? "selected" : ""}>${esc(k.naam || `Kleur ${i + 1}`)}</option>`)
    .join("");
}

function paneel(sleutel, titel, inhoud) {
  return `
    <details class="ed-paneel" data-paneel="${sleutel}" ${dichtePanelen.has(sleutel) ? "" : "open"}>
      <summary><i data-lucide="chevron-right"></i>${titel}</summary>
      <div class="ed-paneel__inhoud">${inhoud}</div>
    </details>
  `;
}

function rij(label, veld) {
  return `<label class="ed-rij"><span>${label}</span>${veld}</label>`;
}

function editorPanelen() {
  const s = stijlgids;

  const merk = `
    ${rij("Naam", `<input class="ed-input" type="text" data-veld="naam" value="${esc(s.naam)}">`)}
    ${rij("Slogan", `<input class="ed-input" type="text" data-veld="slogan" value="${esc(s.slogan)}">`)}
    <label class="ed-rij ed-rij--blok">
      <span>Intro</span>
      <textarea class="ed-input" rows="4" data-veld="intro" placeholder="Wie is het merk, wat doen ze, hoe voelt de stijl?">${esc(s.intro)}</textarea>
    </label>
  `;

  const kleuren = `
    ${s.kleuren.map((k, i) => `
      <div class="ed-kleur">
        <input type="color" data-kleur="${i}" data-eig="kleur" value="${k.hex}" aria-label="Kleur kiezen">
        <input class="ed-input" type="text" data-kleur="${i}" data-eig="naam" value="${esc(k.naam)}" aria-label="Naam van de kleur">
        <input class="ed-input ed-input--mono" type="text" data-kleur="${i}" data-eig="hex" value="${k.hex}" maxlength="7" aria-label="Hex-code">
        <button type="button" class="icon-btn" data-kleur-weg="${i}" aria-label="Kleur verwijderen"><i data-lucide="x"></i></button>
        <input class="ed-input ed-kleur__gebruik" type="text" data-kleur="${i}" data-eig="gebruik" value="${esc(k.gebruik)}" placeholder="Waarvoor gebruik je deze kleur?">
      </div>
    `).join("")}
    <button type="button" class="btn btn--ghost ed-erbij" data-kleur-erbij ${s.kleuren.length >= 10 ? "disabled" : ""}>
      <i data-lucide="plus"></i> Kleur toevoegen
    </button>
    <div class="ed-scheiding"></div>
    ${KLEUR_ROLLEN.map(([rol, label]) => rij(label, `<select class="ed-input" data-rol="${rol}">${rolOpties(rol)}</select>`)).join("")}
  `;

  const typografie = `
    ${FONT_VELDEN.map(([rol, label]) => rij(label,
      `<input class="ed-input" type="text" list="font-suggesties" data-font="${rol}" value="${esc(s.fonts[rol])}">`
    )).join("")}
    <p class="muted klein">Gebruik namen van Google Fonts. Een font dat daar niet op staat, zie je alleen als het op je computer is geïnstalleerd.</p>
  `;

  const knoppen = `
    <label class="ed-rij">
      <span>Rondheid</span>
      <div class="ed-schuif">
        <input type="range" min="0" max="41" step="1" data-knop="radius" value="${radiusNaarSchuif(s.knoppen.radius)}">
        <output class="ed-waarde" id="radius-waarde">${radiusTekst(s.knoppen.radius)}</output>
      </div>
    </label>
    ${rij("Primair", `<input class="ed-input" type="text" data-knop="primair" value="${esc(s.knoppen.primair)}">`)}
    ${rij("Secundair", `<input class="ed-input" type="text" data-knop="secundair" value="${esc(s.knoppen.secundair)}">`)}
    ${rij("Link", `<input class="ed-input" type="text" data-knop="link" value="${esc(s.knoppen.link)}">`)}
  `;

  return [
    paneel("merk", "Merk", merk),
    paneel("kleuren", "Kleuren", kleuren),
    paneel("typografie", "Typografie", typografie),
    paneel("knoppen", "Knoppen", knoppen),
  ].join("");
}

function renderEditor() {
  if (!stijlgids) {
    content.innerHTML = `<p class="muted">Stijlgids laden…</p>`;
    return;
  }

  const p = projecten.find((x) => x.id === openProjectId);

  content.innerHTML = `
    <div class="editor-kop">
      <button class="terug-link" data-terug-project>
        <i data-lucide="arrow-left"></i> ${esc(p?.naam || "Project")}
      </button>
      <div class="editor-kop__acties">
        <span class="muted klein" id="opslaan-status">${stijlgidsGewijzigd ? "Niet opgeslagen wijzigingen" : "Alles opgeslagen"}</span>
        <button class="btn btn--primary" data-stijlgids-opslaan>
          <i data-lucide="save"></i> Opslaan en bestanden maken
        </button>
      </div>
    </div>

    <div class="editor">
      <form class="editor__panelen" id="editor-form" autocomplete="off">
        ${editorPanelen()}
      </form>

      <div class="editor__voorbeeld">
        <div class="voorbeeld-balk">
          <span class="dot dot--red"></span>
          <span class="dot dot--yellow"></span>
          <span class="dot dot--green"></span>
          <span class="voorbeeld-balk__url">projecten/${esc(openProjectId)}/site/index.html</span>
        </div>
        <iframe id="voorbeeld" title="Voorbeeld van de stijlgids-website"></iframe>
      </div>
    </div>

    <datalist id="font-suggesties">
      ${FONT_SUGGESTIES.map((f) => `<option value="${f}"></option>`).join("")}
    </datalist>
  `;
}

// Alleen de panelen opnieuw tekenen (bijv. na kleur toevoegen)
function hertekenPanelen() {
  const form = document.getElementById("editor-form");
  if (!form) return;
  form.innerHTML = editorPanelen();
  lucide.createIcons();
  markeerGewijzigd();
  verversVoorbeeld();
}

function verversRolOpties() {
  document.querySelectorAll("[data-rol]").forEach((select) => {
    select.innerHTML = rolOpties(select.dataset.rol);
  });
}

// ---------- Invoer ----------

content.addEventListener("input", (e) => {
  if (modus !== "stijlgids" || !stijlgids) return;
  const el = e.target;

  if (el.dataset.veld) {
    stijlgids[el.dataset.veld] = el.value;
  } else if (el.dataset.font) {
    stijlgids.fonts[el.dataset.font] = el.value;
  } else if (el.dataset.knop) {
    if (el.dataset.knop === "radius") {
      const waarde = Number(el.value);
      stijlgids.knoppen.radius = waarde > 40 ? 999 : waarde;
      document.getElementById("radius-waarde").textContent = radiusTekst(stijlgids.knoppen.radius);
    } else {
      stijlgids.knoppen[el.dataset.knop] = el.value;
    }
  } else if (el.dataset.kleur !== undefined) {
    const kleur = stijlgids.kleuren[Number(el.dataset.kleur)];
    const rijEl = el.closest(".ed-kleur");

    if (el.dataset.eig === "kleur") {
      kleur.hex = el.value.toUpperCase();
      rijEl.querySelector('[data-eig="hex"]').value = kleur.hex;
    } else if (el.dataset.eig === "hex") {
      let v = el.value.trim();
      if (!v.startsWith("#")) v = "#" + v;
      if (!/^#[0-9a-f]{6}$/i.test(v)) return; // wacht tot de code compleet is
      kleur.hex = v.toUpperCase();
      rijEl.querySelector('[data-eig="kleur"]').value = v;
    } else {
      kleur[el.dataset.eig] = el.value;
      if (el.dataset.eig === "naam") verversRolOpties();
    }
  } else {
    return;
  }

  markeerGewijzigd();
  verversVoorbeeld();
});

content.addEventListener("change", (e) => {
  if (modus !== "stijlgids" || !stijlgids) return;
  const select = e.target.closest("[data-rol]");
  if (!select) return;
  stijlgids.rollen[select.dataset.rol] = Number(select.value);
  markeerGewijzigd();
  verversVoorbeeld();
});

content.addEventListener("click", (e) => {
  if (modus !== "stijlgids" || !stijlgids) return;

  if (e.target.closest("[data-kleur-erbij]")) {
    if (stijlgids.kleuren.length >= 10) return;
    stijlgids.kleuren.push({ naam: "Nieuwe kleur", hex: "#888888", gebruik: "" });
    return hertekenPanelen();
  }

  const weg = e.target.closest("[data-kleur-weg]");
  if (weg) {
    if (stijlgids.kleuren.length <= 2) return toast("Een stijlgids heeft minstens 2 kleuren nodig.", "fout");
    const i = Number(weg.dataset.kleurWeg);
    stijlgids.kleuren.splice(i, 1);
    for (const rol in stijlgids.rollen) {
      if (stijlgids.rollen[rol] === i) stijlgids.rollen[rol] = 0;
      else if (stijlgids.rollen[rol] > i) stijlgids.rollen[rol]--;
    }
    return hertekenPanelen();
  }

  if (e.target.closest("[data-stijlgids-opslaan]")) return slaStijlgidsOp();

  if (e.target.closest("[data-terug-project]")) {
    gaNaar(huidigePagina, openProjectId);
  }
});

// Onthoud welke panelen je hebt dichtgeklapt
content.addEventListener("toggle", (e) => {
  const paneelEl = e.target;
  if (!paneelEl.matches?.(".ed-paneel")) return;
  if (paneelEl.open) dichtePanelen.delete(paneelEl.dataset.paneel);
  else dichtePanelen.add(paneelEl.dataset.paneel);
}, true);

// Waarschuwing als je de pagina sluit met niet-opgeslagen wijzigingen
window.addEventListener("beforeunload", (e) => {
  if (stijlgidsGewijzigd) e.preventDefault();
});