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

// Moet overeenkomen met FONT_ROLLEN in stijlgids.js
const FONT_ROLLEN = {
  koppen: { label: "Koppen", gebruik: "Titels en grote koppen.", voorbeeld: "Playfair Display" },
  tekst: { label: "Lopende tekst", gebruik: "Alinea's, knoppen en labels.", voorbeeld: "Inter" },
  sier: { label: "Sierletter", gebruik: "Eén beginletter in een kop, nooit hele zinnen.", voorbeeld: "Pinyon Script" },
  logo: { label: "Logo", gebruik: "Het logo en korte labels in hoofdletters.", voorbeeld: "Montserrat" },
  hand: { label: "Handschrift", gebruik: "Korte, persoonlijke notities.", voorbeeld: "Caveat" },
  accent: { label: "Accent", gebruik: "Citaten, cijfers of andere opvallende tekst.", voorbeeld: "Fraunces" },
};

// De vaste kopjes over het merk
const CONTEXT_VELDEN = [
  { key: "over", label: "Over het merk", hint: "Wie zijn jullie en wat doen jullie?", rijen: 4 },
  { key: "doelgroep", label: "Doelgroep", hint: "Voor wie is het merk? Leeftijd, interesses, waar zijn ze te vinden?", rijen: 3 },
  { key: "missie", label: "Missie", hint: "Wat doen jullie elke dag, en waarom?", rijen: 3 },
  { key: "visie", label: "Visie", hint: "Waar willen jullie over een paar jaar staan?", rijen: 3 },
  { key: "kernwaarden", label: "Kernwaarden", hint: "Bijv. warm, eerlijk, creatief (scheid met komma's)", rijen: 2 },
  { key: "toon", label: "Tone of voice", hint: "Hoe praat het merk? Bijv. persoonlijk en luchtig, met af en toe een emoji.", rijen: 3 },
  { key: "doen", label: "Wel doen", hint: "Eén per regel. Bijv.\nAltijd de jij-vorm gebruiken\nKorte zinnen", rijen: 3 },
  { key: "nietDoen", label: "Niet doen", hint: "Eén per regel. Bijv.\nGeen vakjargon\nGeen hoofdletters voor nadruk", rijen: 3 },
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
let stijlgidsBron = "project"; // "project" of "standaard" (zie instellingen)

// ---------- Oude of onvolledige stijlgids aanvullen ----------

function maakVolledig(s) {
  // Over het merk
  if (!s.context || typeof s.context !== "object") s.context = {};
  for (const veld of CONTEXT_VELDEN) {
    if (typeof s.context[veld.key] !== "string") {
      s.context[veld.key] = veld.key === "over" && typeof s.intro === "string" ? s.intro : "";
    }
  }
  delete s.intro;

  // Fonts: oude vorm was een object { koppen: "...", ... }
  if (!Array.isArray(s.fonts)) {
    const oud = s.fonts && typeof s.fonts === "object" ? s.fonts : {};
    s.fonts = Object.entries(oud)
      .filter(([rol, font]) => FONT_ROLLEN[rol] && font)
      .map(([rol, font]) => ({ font, rol, gebruik: "" }));
  }
  if (!s.fonts.length) s.fonts = [{ font: "Inter", rol: "koppen", gebruik: "" }];
  for (const font of s.fonts) {
    if (!FONT_ROLLEN[font.rol]) font.rol = "accent";
    if (typeof font.gebruik !== "string") font.gebruik = "";
    if (typeof font.font !== "string") font.font = "";
  }

  // Overige onderdelen
  if (!Array.isArray(s.kleuren)) s.kleuren = [];
  if (!s.rollen) s.rollen = { achtergrond: 0, tekst: 0, hoofd: 0, tweede: 0 };
  if (!s.knoppen) s.knoppen = { radius: 999, primair: "", secundair: "", link: "" };
  if (typeof s.naam !== "string") s.naam = "";
  if (typeof s.slogan !== "string") s.slogan = "";

  return s;
}

// ---------- Laden en opslaan ----------

async function laadStijlgids() {
  stijlgids = null;
  render();
  try {
    const url = stijlgidsBron === "standaard"
      ? "/api/instellingen/stijlgids"
      : `/api/projecten/${openProjectId}/stijlgids`;
    stijlgids = maakVolledig(await api(url));
    stijlgidsGewijzigd = false;
    render();
  } catch (fout) {
    toast(fout.message, "fout");
  }
}

async function slaStijlgidsOp() {
  const standaard = stijlgidsBron === "standaard";
  const knop = document.querySelector("[data-stijlgids-opslaan]");
  if (knop) {
    knop.disabled = true;
    knop.innerHTML = standaard
      ? `<i data-lucide="loader"></i> Opslaan…`
      : `<i data-lucide="loader"></i> Bestanden maken…`;
    lucide.createIcons();
  }

  try {
    if (standaard) {
      const res = await api("/api/instellingen/stijlgids", {
        method: "PUT",
        body: JSON.stringify(stijlgids),
      });
      stijlgids = maakVolledig(res.data);
      stijlgidsGewijzigd = false;
      toast("Standaard stijlgids opgeslagen");
      standaardStijl = stijlgids;
    } else {
      const res = await api(`/api/projecten/${openProjectId}/stijlgids`, {
        method: "PUT",
        body: JSON.stringify(stijlgids),
      });
      stijlgids = maakVolledig(res.data);
      stijlgidsGewijzigd = false;

      if (res.waarschuwing) toast(res.waarschuwing, "fout");
      else toast(`Opgeslagen: ${res.bestanden.length} bestanden gemaakt`);

      await laadProjecten();
    }
  } catch (fout) {
    toast(fout.message, "fout");
    if (knop && knop.isConnected) {
      knop.disabled = false;
      knop.innerHTML = standaard
        ? `<i data-lucide="save"></i> Opslaan`
        : `<i data-lucide="save"></i> Opslaan en bestanden maken`;
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

function aantalContextIngevuld() {
  return CONTEXT_VELDEN.filter((v) => (stijlgids.context[v.key] || "").trim()).length;
}

function paneel(sleutel, titel, inhoud, extra = "") {
  return `
    <details class="ed-paneel" data-paneel="${sleutel}" ${dichtePanelen.has(sleutel) ? "" : "open"}>
      <summary><i data-lucide="chevron-right"></i>${titel}${extra}</summary>
      <div class="ed-paneel__inhoud">${inhoud}</div>
    </details>
  `;
}

function rij(label, veld) {
  return `<label class="ed-rij"><span>${label}</span>${veld}</label>`;
}

function editorPanelen() {
  const s = stijlgids;
  const standaard = stijlgidsBron === "standaard";

  // Merk (bij de standaard is er geen vaste naam, alleen een slogan als voorbeeldtekst)
  const merk = `
    ${standaard ? "" : rij("Naam", `<input class="ed-input" type="text" data-veld="naam" value="${esc(s.naam)}">`)}
    ${rij("Slogan", `<input class="ed-input" type="text" data-veld="slogan" value="${esc(s.slogan)}">`)}
  `;

  // Over het merk
  const context = `
    ${CONTEXT_VELDEN.map((v) => `
      <label class="ed-rij ed-rij--blok">
        <span>${v.label}</span>
        <textarea class="ed-input" rows="${v.rijen}" data-context="${v.key}" placeholder="${esc(v.hint)}">${esc(s.context[v.key])}</textarea>
      </label>
    `).join("")}
    <p class="muted klein">Lege velden komen niet op de website.</p>
  `;

  // Kleuren
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

  // Typografie
  const typografie = `
    ${s.fonts.map((f, i) => `
      <div class="ed-font">
        <select class="ed-input" data-font="${i}" data-eig="rol" aria-label="Rol van dit font">
          ${Object.entries(FONT_ROLLEN).map(([key, r]) => `<option value="${key}" ${f.rol === key ? "selected" : ""}>${r.label}</option>`).join("")}
        </select>
        <input class="ed-input" type="text" list="font-suggesties" data-font="${i}" data-eig="font" value="${esc(f.font)}" placeholder="Naam van het font" aria-label="Font">
        <button type="button" class="icon-btn" data-font-weg="${i}" aria-label="Font verwijderen"><i data-lucide="x"></i></button>
        <input class="ed-input ed-font__gebruik" type="text" data-font="${i}" data-eig="gebruik" value="${esc(f.gebruik)}" placeholder="${esc(FONT_ROLLEN[f.rol].gebruik)}" aria-label="Waarvoor gebruik je dit font?">
      </div>
    `).join("")}
    <button type="button" class="btn btn--ghost ed-erbij" data-font-erbij ${s.fonts.length >= 6 ? "disabled" : ""}>
      <i data-lucide="plus"></i> Font toevoegen
    </button>
    <p class="muted klein">Gebruik namen van Google Fonts. Heb je voor een rol geen font, dan gebruikt de site automatisch een van je andere fonts.</p>
  `;

  // Knoppen
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

  const contextTeller = `<span class="ed-teller" id="context-teller">${aantalContextIngevuld()}/${CONTEXT_VELDEN.length}</span>`;
  const fontTeller = `<span class="ed-teller">${s.fonts.length}</span>`;
  const kleurTeller = `<span class="ed-teller">${s.kleuren.length}</span>`;

  const panelen = [paneel("merk", "Merk", merk)];
  if (!standaard) panelen.push(paneel("context", "Over het merk", context, contextTeller));
  panelen.push(
    paneel("kleuren", "Kleuren", kleuren, kleurTeller),
    paneel("typografie", "Typografie", typografie, fontTeller),
    paneel("knoppen", "Knoppen", knoppen)
  );
  return panelen.join("");
}

function renderEditor() {
  if (!stijlgids) {
    content.innerHTML = `<p class="muted">Stijlgids laden…</p>`;
    return;
  }

  const standaard = stijlgidsBron === "standaard";
  const p = standaard ? null : projecten.find((x) => x.id === openProjectId);
  const terugTekst = standaard ? "Instellingen" : (p?.naam || "Project");
  const balkTekst = standaard ? "standaard stijlgids" : `projecten/${esc(openProjectId)}/site/index.html`;
  const knopTekst = standaard ? "Opslaan" : "Opslaan en bestanden maken";
  const magOpslaan = magIk(standaard ? "instellingen" : "stijlgidsen");

  content.innerHTML = `
    <div class="editor-kop">
      <button class="terug-link" data-terug-project>
        <i data-lucide="arrow-left"></i> ${esc(terugTekst)}
      </button>
      <div class="editor-kop__acties">
        ${magOpslaan ? `
        <span class="muted klein" id="opslaan-status">${stijlgidsGewijzigd ? "Niet opgeslagen wijzigingen" : "Alles opgeslagen"}</span>
        <button class="btn btn--primary" data-stijlgids-opslaan>
          <i data-lucide="save"></i> ${knopTekst}
        </button>` : `
        <span class="muted klein">Alleen bekijken — je rol mag dit niet opslaan</span>`}
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
          <span class="voorbeeld-balk__url">${esc(balkTekst)}</span>
        </div>
        <iframe id="voorbeeld" title="Voorbeeld van de stijlgids-website"></iframe>
      </div>
    </div>

    <datalist id="font-suggesties">
      ${FONT_SUGGESTIES.map((f) => `<option value="${f}"></option>`).join("")}
    </datalist>
  `;
}

// Alleen de panelen opnieuw tekenen (bijv. na kleur of font toevoegen)
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

// Eerste rol die nog niet gebruikt wordt
function vrijeFontRol() {
  const gebruikt = new Set(stijlgids.fonts.map((f) => f.rol));
  return Object.keys(FONT_ROLLEN).find((rol) => !gebruikt.has(rol)) || "accent";
}

// ---------- Invoer ----------

content.addEventListener("input", (e) => {
  if (modus !== "stijlgids" || !stijlgids) return;
  const el = e.target;

  if (el.dataset.veld) {
    stijlgids[el.dataset.veld] = el.value;
  } else if (el.dataset.context) {
    stijlgids.context[el.dataset.context] = el.value;
    const teller = document.getElementById("context-teller");
    if (teller) teller.textContent = `${aantalContextIngevuld()}/${CONTEXT_VELDEN.length}`;
  } else if (el.dataset.font !== undefined) {
    const font = stijlgids.fonts[Number(el.dataset.font)];
    font[el.dataset.eig] = el.value;

    // Bij een andere rol de voorbeeldtekst van "waarvoor" aanpassen
    if (el.dataset.eig === "rol") {
      const gebruikVeld = el.closest(".ed-font").querySelector('[data-eig="gebruik"]');
      gebruikVeld.placeholder = FONT_ROLLEN[el.value].gebruik;
    }
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

// Kleurrollen (achtergrond, tekst, hoofdkleur, tweede kleur)
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

  // Kleur toevoegen
  if (e.target.closest("[data-kleur-erbij]")) {
    if (stijlgids.kleuren.length >= 10) return;
    stijlgids.kleuren.push({ naam: "Nieuwe kleur", hex: "#888888", gebruik: "" });
    return hertekenPanelen();
  }

  // Kleur verwijderen
  const kleurWeg = e.target.closest("[data-kleur-weg]");
  if (kleurWeg) {
    if (stijlgids.kleuren.length <= 2) return toast("Een stijlgids heeft minstens 2 kleuren nodig.", "fout");
    const i = Number(kleurWeg.dataset.kleurWeg);
    stijlgids.kleuren.splice(i, 1);
    for (const rol in stijlgids.rollen) {
      if (stijlgids.rollen[rol] === i) stijlgids.rollen[rol] = 0;
      else if (stijlgids.rollen[rol] > i) stijlgids.rollen[rol]--;
    }
    return hertekenPanelen();
  }

  // Font toevoegen
  if (e.target.closest("[data-font-erbij]")) {
    if (stijlgids.fonts.length >= 6) return;
    const rol = vrijeFontRol();
    stijlgids.fonts.push({ font: FONT_ROLLEN[rol].voorbeeld, rol, gebruik: "" });
    return hertekenPanelen();
  }

  // Font verwijderen
  const fontWeg = e.target.closest("[data-font-weg]");
  if (fontWeg) {
    if (stijlgids.fonts.length <= 1) return toast("Een stijlgids heeft minstens 1 font nodig.", "fout");
    stijlgids.fonts.splice(Number(fontWeg.dataset.fontWeg), 1);
    return hertekenPanelen();
  }

  if (e.target.closest("[data-stijlgids-opslaan]")) return slaStijlgidsOp();

  if (e.target.closest("[data-terug-project]")) {
    if (stijlgidsBron === "standaard") gaNaar("instellingen");
    else gaNaar(huidigePagina, openProjectId);
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