// =========================================
// Stijlgids: standaardwaarden, controle en alle gegenereerde bestanden
// =========================================

const fs = require("fs/promises");
const path = require("path");

const FALLBACK = {
  koppen: "Georgia, 'Times New Roman', serif",
  sier: "'Brush Script MT', cursive",
  tekst: "system-ui, -apple-system, sans-serif",
  logo: "'Helvetica Neue', Arial, sans-serif",
  hand: "'Segoe Print', cursive",
};

const FONT_ROLLEN = {
  koppen: { label: "Koppen", gebruik: "Titels en grote koppen." },
  sier: { label: "Sierletter", gebruik: "Eén beginletter in een kop, nooit hele zinnen." },
  tekst: { label: "Lopende tekst", gebruik: "Alinea's, knoppen en labels." },
  logo: { label: "Logo", gebruik: "Het logo en korte labels in hoofdletters." },
  hand: { label: "Handschrift", gebruik: "Korte, persoonlijke notities." },
};

// ---------- Standaard stijlgids voor een nieuw project ----------

function standaardStijlgids(naam) {
  return {
    naam,
    slogan: "Een korte zin over wat dit merk doet.",
    intro: "",
    kleuren: [
      { naam: "Hoofdkleur", hex: "#5A1A17", gebruik: "Logo, knoppen en accenten." },
      { naam: "Achtergrond", hex: "#F3EEE7", gebruik: "De basis van elke pagina." },
      { naam: "Accent", hex: "#E6D9C3", gebruik: "Vlakken en secundaire knoppen." },
      { naam: "Tekst", hex: "#1C1C1C", gebruik: "Alle lopende tekst." },
    ],
    rollen: { achtergrond: 1, tekst: 3, hoofd: 0, tweede: 2 },
    fonts: {
      koppen: "Bodoni Moda",
      sier: "Pinyon Script",
      tekst: "Courier Prime",
      logo: "Montserrat",
      hand: "Homemade Apple",
    },
    knoppen: { radius: 999, primair: "Neem contact op", secundair: "Bekijk werk", link: "Meer over ons" },
  };
}

// ---------- Controle: alleen geldige data opslaan ----------

const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const tekst = (v, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

function normaliseer(invoer, naamReserve = "Merk") {
  const std = standaardStijlgids(naamReserve);
  const d = invoer && typeof invoer === "object" ? invoer : {};

  let kleuren = Array.isArray(d.kleuren)
    ? d.kleuren
        .filter((k) => k && isHex(k.hex))
        .slice(0, 10)
        .map((k) => ({
          naam: tekst(k.naam, 40).trim() || "Kleur",
          hex: k.hex.toUpperCase(),
          gebruik: tekst(k.gebruik, 160),
        }))
    : [];
  if (kleuren.length < 2) kleuren = std.kleuren;

  const rol = (v, reserve) =>
    Number.isInteger(v) && v >= 0 && v < kleuren.length ? v : Math.min(reserve, kleuren.length - 1);

  const font = (v, reserve) => {
    const schoon = tekst(v, 60).replace(/[^\p{L}\p{N} -]/gu, "").trim();
    return schoon || reserve;
  };

  const radius = Number(d.knoppen?.radius);

  return {
    naam: tekst(d.naam, 80).trim() || std.naam,
    slogan: tekst(d.slogan, 160),
    intro: tekst(d.intro, 1200),
    kleuren,
    rollen: {
      achtergrond: rol(d.rollen?.achtergrond, std.rollen.achtergrond),
      tekst: rol(d.rollen?.tekst, std.rollen.tekst),
      hoofd: rol(d.rollen?.hoofd, std.rollen.hoofd),
      tweede: rol(d.rollen?.tweede, std.rollen.tweede),
    },
    fonts: {
      koppen: font(d.fonts?.koppen, std.fonts.koppen),
      sier: font(d.fonts?.sier, std.fonts.sier),
      tekst: font(d.fonts?.tekst, std.fonts.tekst),
      logo: font(d.fonts?.logo, std.fonts.logo),
      hand: font(d.fonts?.hand, std.fonts.hand),
    },
    knoppen: {
      radius: Number.isFinite(radius) ? Math.max(0, Math.min(999, Math.round(radius))) : 999,
      primair: tekst(d.knoppen?.primair, 40),
      secundair: tekst(d.knoppen?.secundair, 40),
      link: tekst(d.knoppen?.link, 40),
    },
  };
}

// ---------- Hulpfuncties ----------

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function slug(t) {
  return String(t)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "kleur";
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminantie(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Witte of donkere tekst, afhankelijk van de achtergrond
function tekstOp(hex) {
  return luminantie(hex) > 0.4 ? "#1C1C1C" : "#FFFFFF";
}

// Twee kleuren mengen (t = 0 → kleur1, t = 1 → kleur2)
function mix(hex1, hex2, t) {
  const a = rgb(hex1);
  const b = rgb(hex2);
  return "#" + a
    .map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function thema(d) {
  const k = (i) => d.kleuren[i].hex;
  const achtergrond = k(d.rollen.achtergrond);
  const tekstKleur = k(d.rollen.tekst);
  const hoofd = k(d.rollen.hoofd);
  const tweede = k(d.rollen.tweede);
  const lichteAchtergrond = luminantie(achtergrond) > 0.4;

  return {
    achtergrond,
    tekst: tekstKleur,
    hoofd,
    tweede,
    opHoofd: tekstOp(hoofd),
    opTweede: tekstOp(tweede),
    gedempt: mix(tekstKleur, achtergrond, 0.4),
    lijn: mix(tekstKleur, achtergrond, 0.85),
    vlak: lichteAchtergrond ? mix(achtergrond, "#FFFFFF", 0.45) : mix(achtergrond, "#FFFFFF", 0.06),
    hoofdDonker: mix(hoofd, "#000000", 0.35),
  };
}

// Unieke CSS-namen per kleur: --kleur-bordeaux, --kleur-creme, ...
function kleurNamen(d) {
  const gezien = new Set();
  return d.kleuren.map((k) => {
    const basis = slug(k.naam);
    let naam = basis;
    let i = 2;
    while (gezien.has(naam)) naam = `${basis}-${i++}`;
    gezien.add(naam);
    return `--kleur-${naam}`;
  });
}

function fontStack(d, rol) {
  return `"${d.fonts[rol]}", ${FALLBACK[rol]}`;
}

function uniekeFonts(d) {
  return [...new Set(Object.values(d.fonts))];
}

function googleUrl(fonts, metGewicht) {
  const families = fonts
    .map((f) => "family=" + encodeURIComponent(f).replace(/%20/g, "+") + (metGewicht ? ":wght@400;700" : ""))
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

// <link>-tags voor alle fonts (per font één met vet en één gewone als reserve)
function fontLinksHtml(d) {
  return uniekeFonts(d)
    .map((f) => `<link rel="stylesheet" href="${esc(googleUrl([f], true))}">\n  <link rel="stylesheet" href="${esc(googleUrl([f], false))}">`)
    .join("\n  ");
}

function radiusCss(d) {
  return d.knoppen.radius >= 999 ? "999px" : `${d.knoppen.radius}px`;
}

// ---------- variabelen.css ----------

function maakCss(d, { metImport = true } = {}) {
  const t = thema(d);
  const namen = kleurNamen(d);
  const v = (i) => `var(${namen[i]})`;

  return `/* ${d.naam} — stijlgids
   Gemaakt met Studio Dashboard. Pas de stijlgids aan in de app, niet in dit bestand. */
${metImport ? `@import url("${googleUrl(uniekeFonts(d), false)}");\n` : ""}
:root {
  /* Kleuren */
${d.kleuren.map((k, i) => `  ${namen[i]}: ${k.hex};`).join("\n")}

  /* Rollen */
  --achtergrond: ${v(d.rollen.achtergrond)};
  --tekst: ${v(d.rollen.tekst)};
  --hoofd: ${v(d.rollen.hoofd)};
  --tweede: ${v(d.rollen.tweede)};
  --op-hoofd: ${t.opHoofd};
  --op-tweede: ${t.opTweede};
  --gedempt: ${t.gedempt};
  --lijn: ${t.lijn};
  --vlak: ${t.vlak};

  /* Fonts */
${Object.keys(FONT_ROLLEN).map((r) => `  --font-${r}: ${fontStack(d, r)};`).join("\n")}

  /* Knoppen */
  --knop-radius: ${radiusCss(d)};
}

.knop {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 13px 26px;
  border-radius: var(--knop-radius);
  border: 1px solid transparent;
  font-family: var(--font-tekst);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
}
.knop--primair { background: var(--hoofd); color: var(--op-hoofd); }
.knop--secundair { background: var(--tweede); color: var(--op-tweede); }
.knop--link { padding-inline: 2px; border-radius: 0; border-bottom-color: var(--hoofd); color: var(--hoofd); }

.sier { font-family: var(--font-sier); font-weight: 400; color: var(--hoofd); }
`;
}

// ---------- Vormen voor de cover (480 × 300) ----------

function svgVormen(t) {
  return `
    <rect x="40" y="50" width="170" height="190" fill="${t.tweede}"/>
    <rect x="290" y="0" width="190" height="300" fill="${t.hoofd}"/>
    <circle cx="290" cy="110" r="62" fill="${t.hoofdDonker}"/>
    <rect x="110" y="170" width="150" height="130" rx="3" fill="${t.vlak}"/>
    <g stroke="${t.lijn}" stroke-width="1">
      <line x1="0" y1="60" x2="480" y2="60"/>
      <line x1="0" y1="110" x2="480" y2="110"/>
      <line x1="0" y1="240" x2="480" y2="240"/>
      <line x1="0" y1="285" x2="480" y2="285"/>
    </g>`;
}

// ---------- De website: site/index.html ----------

const PAGINA_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--achtergrond);
  color: var(--tekst);
  font-family: var(--font-tekst);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
code, pre { font-family: ui-monospace, Menlo, Consolas, monospace; }

.cover {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 380px;
  border-bottom: 1px solid var(--lijn);
  overflow: hidden;
}
.cover__tekst {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 40px;
  padding: 40px clamp(20px, 5vw, 64px) 48px;
}
.logo {
  font-family: var(--font-logo);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.cover h1 {
  font-family: var(--font-koppen);
  font-weight: 500;
  font-size: clamp(48px, 7vw, 96px);
  line-height: 0.95;
  letter-spacing: -0.01em;
  text-wrap: balance;
}
.cover__slogan { margin-top: 16px; color: var(--gedempt); font-size: 15px; }
.cover__vormen { display: block; width: 100%; height: 100%; }

main {
  max-width: 1080px;
  margin: 0 auto;
  padding: 72px clamp(20px, 5vw, 64px) 96px;
  display: flex;
  flex-direction: column;
  gap: 96px;
}
.label {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gedempt);
  margin-bottom: 12px;
}
h2 {
  font-family: var(--font-koppen);
  font-weight: 500;
  font-size: clamp(34px, 4.5vw, 54px);
  line-height: 1.05;
  margin-bottom: 24px;
  text-wrap: balance;
}
h3 { font-family: var(--font-koppen); font-weight: 500; font-size: 26px; line-height: 1.2; }
.lead { max-width: 62ch; font-size: 17px; }
.notitie { font-family: var(--font-hand); color: var(--hoofd); font-size: 20px; margin-bottom: 8px; }

/* Kleuren */
.palet {
  display: flex;
  min-height: 260px;
  border: 1px solid var(--lijn);
  border-radius: 6px;
  overflow: hidden;
}
.palet > div {
  flex: 1;
  min-width: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  font-size: 12px;
  line-height: 1.4;
}
.palet > div.is-hoofd { flex: 2; }
.palet strong { font-size: 14px; }
.kleur-lijst {
  list-style: none;
  margin-top: 32px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px 32px;
}
.kleur-lijst li { display: flex; gap: 12px; }
.kleur-lijst p { color: var(--gedempt); font-size: 14px; }
.kleur-lijst code { font-size: 12px; color: var(--gedempt); }
.stip { width: 20px; height: 20px; flex: none; margin-top: 3px; border-radius: 50%; border: 1px solid var(--lijn); }

/* Typografie */
.voorbeeldkop {
  font-family: var(--font-koppen);
  font-size: clamp(40px, 6vw, 72px);
  line-height: 1;
  margin-bottom: 40px;
}
.voorbeeldkop .sier { font-size: 1.35em; line-height: 0.6; }
.fonts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1px;
  background: var(--lijn);
  border: 1px solid var(--lijn);
  border-radius: 6px;
  overflow: hidden;
}
.font { background: var(--vlak); padding: 28px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.font__gebruik { color: var(--gedempt); font-size: 14px; }
.font__aa { font-size: 96px; line-height: 1.1; margin: 16px 0 8px; }
.font__abc { font-size: 15px; line-height: 1.5; color: var(--gedempt); overflow-wrap: anywhere; }

/* Knoppen */
.knoppen {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 40px;
  background: var(--vlak);
  border: 1px solid var(--lijn);
  border-radius: 6px;
}
.regels { list-style: none; margin-top: 24px; display: grid; gap: 10px; max-width: 70ch; }
.regels li { display: flex; gap: 12px; color: var(--gedempt); }
.regels strong { color: var(--tekst); min-width: 110px; }

/* Code */
pre {
  background: var(--vlak);
  border: 1px solid var(--lijn);
  border-radius: 6px;
  padding: 20px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 16px;
}

footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 16px;
  padding: 24px clamp(20px, 5vw, 64px);
  border-top: 1px solid var(--lijn);
  font-size: 13px;
  color: var(--gedempt);
}

@media (max-width: 720px) {
  .cover { grid-template-columns: 1fr; }
  .cover__vormen { height: 200px; order: -1; }
  .palet { flex-direction: column; }
  .palet > div { min-height: 84px; }
}

/* PDF */
@page { size: A4; margin: 0; }

@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  main { gap: 64px; padding-top: 56px; padding-bottom: 56px; }
  .palet, .font, .knoppen, .kleur-lijst li, .regels, pre { break-inside: avoid; }
  h2, .label { break-after: avoid; }
  pre { white-space: pre-wrap; word-break: break-all; }
}
`;

function maakHtml(d) {
  const t = thema(d);
  const fonts = uniekeFonts(d);

  const palet = d.kleuren
    .map((k, i) => `
        <div class="${i === d.rollen.hoofd ? "is-hoofd" : ""}" style="background:${k.hex};color:${tekstOp(k.hex)}">
          <strong>${esc(k.naam)}</strong>
          <span>HEX ${k.hex}</span>
          <span>RGB ${rgb(k.hex).join(" ")}</span>
        </div>`)
    .join("");

  const kleurLijst = d.kleuren
    .map((k) => `
        <li>
          <span class="stip" style="background:${k.hex}"></span>
          <div>
            <strong>${esc(k.naam)}</strong> <code>${k.hex}</code>
            ${k.gebruik ? `<p>${esc(k.gebruik)}</p>` : ""}
          </div>
        </li>`)
    .join("");

  const fontKaarten = Object.entries(FONT_ROLLEN)
    .map(([rol, info]) => `
        <article class="font">
          <p class="label">${info.label}</p>
          <h3>${esc(d.fonts[rol])}</h3>
          <p class="font__gebruik">${info.gebruik}</p>
          <p class="font__aa" style="font-family:var(--font-${rol})">Aa</p>
          <p class="font__abc" style="font-family:var(--font-${rol})">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 &amp;!?</p>
        </article>`)
    .join("");

  const naam = d.naam.trim();
  const datum = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  const radiusTekst = d.knoppen.radius >= 999 ? "helemaal rond (pil)" : d.knoppen.radius === 0 ? "recht" : `${d.knoppen.radius}px`;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(naam)} — Stijlgids</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  ${fontLinksHtml(d)}
  <style>
${maakCss(d, { metImport: false })}
${PAGINA_CSS}
  </style>
</head>
<body>

  <header class="cover">
    <div class="cover__tekst">
      <p class="logo">${esc(naam)}</p>
      <div>
        <h1>${esc(naam)}</h1>
        ${d.slogan ? `<p class="cover__slogan">${esc(d.slogan)}</p>` : ""}
      </div>
    </div>
    <svg class="cover__vormen" viewBox="0 0 480 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      ${svgVormen(t)}
    </svg>
  </header>

  <main>

    <section>
      <p class="label">Stijlgids</p>
      <p class="notitie">Hey there!</p>
      <h2>${esc(naam)}</h2>
      ${d.intro ? `<p class="lead">${esc(d.intro).replace(/\n/g, "<br>")}</p>` : ""}
    </section>

    <section>
      <p class="label">Kleuren</p>
      <h2>Kleurenpalet</h2>
      <div class="palet">${palet}
      </div>
      <ul class="kleur-lijst">${kleurLijst}
      </ul>
    </section>

    <section>
      <p class="label">Typografie</p>
      <p class="voorbeeldkop"><span class="sier">${esc(naam.charAt(0))}</span>${esc(naam.slice(1))}</p>
      <div class="fonts">${fontKaarten}
      </div>
    </section>

    <section>
      <p class="label">Knoppen</p>
      <h2>Knoppen</h2>
      <div class="knoppen">
        ${d.knoppen.primair ? `<a class="knop knop--primair" href="#">${esc(d.knoppen.primair)}</a>` : ""}
        ${d.knoppen.secundair ? `<a class="knop knop--secundair" href="#">${esc(d.knoppen.secundair)}</a>` : ""}
        ${d.knoppen.link ? `<a class="knop knop--link" href="#">${esc(d.knoppen.link)}</a>` : ""}
      </div>
      <ul class="regels">
        <li><strong>Primair</strong> De belangrijkste actie, één per scherm. Hoofdkleur met ${t.opHoofd === "#FFFFFF" ? "witte" : "donkere"} tekst.</li>
        <li><strong>Secundair</strong> Voor de andere acties, in de tweede kleur.</li>
        <li><strong>Link</strong> Voor kleine acties in de tekst, met een dunne lijn eronder.</li>
        <li><strong>Rondheid</strong> ${radiusTekst}.</li>
      </ul>
    </section>

    <section>
      <p class="label">Voor de website</p>
      <h2>Code</h2>
      <p class="lead" style="margin-bottom:20px">Zet de fonts-link in de &lt;head&gt; en gebruik de variabelen uit <code>stijlgids/variabelen.css</code>.</p>
      <pre><code>${esc(`<link rel="stylesheet" href="${googleUrl(fonts, false)}">`)}</code></pre>
      <pre><code>${esc(maakCss(d))}</code></pre>
    </section>

  </main>

  <footer>
    <span>${esc(naam)} · Stijlgids</span>
    <span>Bijgewerkt op ${datum}</span>
  </footer>

</body>
</html>
`;
}

// ---------- images/cover.svg (1200 × 630) ----------

function splitsNaam(naam) {
  const woorden = naam.trim().split(/\s+/);
  if (woorden.length < 2 || naam.length <= 14) return [naam.trim()];
  let beste = 1;
  let verschil = Infinity;
  for (let i = 1; i < woorden.length; i++) {
    const links = woorden.slice(0, i).join(" ").length;
    const rechts = woorden.slice(i).join(" ").length;
    if (Math.abs(links - rechts) < verschil) {
      verschil = Math.abs(links - rechts);
      beste = i;
    }
  }
  return [woorden.slice(0, beste).join(" "), woorden.slice(beste).join(" ")];
}

function maakCoverSvg(d) {
  const t = thema(d);
  const regels = splitsNaam(d.naam);
  const grootte = regels.some((r) => r.length > 12) ? 64 : 84;
  const regelHoogte = Math.round(grootte * 0.98);
  const startY = 470 - (regels.length - 1) * regelHoogte;
  const slogan = d.slogan.length > 60 ? d.slogan.slice(0, 57) + "…" : d.slogan;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${t.achtergrond}"/>
  <svg x="600" y="0" width="600" height="630" viewBox="0 0 480 300" preserveAspectRatio="xMidYMid slice">
    ${svgVormen(t)}
  </svg>
  <text x="72" y="${startY}" font-family="${esc(fontStack(d, "koppen"))}" font-size="${grootte}" fill="${t.tekst}">
    ${regels.map((r, i) => `<tspan x="72" dy="${i === 0 ? 0 : regelHoogte}">${esc(r)}</tspan>`).join("")}
  </text>
  <text x="74" y="540" font-family="${esc(fontStack(d, "tekst"))}" font-size="22" fill="${t.gedempt}">${esc(slogan)}</text>
</svg>
`;
}

// ---------- images/kleurenpalet.svg (1200 × 420) ----------

function maakPaletSvg(d) {
  const totaal = d.kleuren.reduce((som, _, i) => som + (i === d.rollen.hoofd ? 2 : 1), 0);
  const eenheid = 1200 / totaal;
  let x = 0;

  const blokken = d.kleuren
    .map((k, i) => {
      const breedte = eenheid * (i === d.rollen.hoofd ? 2 : 1);
      const kleur = tekstOp(k.hex);
      const blok = `
  <rect x="${x.toFixed(1)}" y="0" width="${(breedte + 0.5).toFixed(1)}" height="420" fill="${k.hex}"/>
  <text x="${(x + 20).toFixed(1)}" y="340" font-family="${esc(fontStack(d, "tekst"))}" fill="${kleur}">
    <tspan x="${(x + 20).toFixed(1)}" font-size="20" font-weight="700">${esc(k.naam)}</tspan>
    <tspan x="${(x + 20).toFixed(1)}" dy="28" font-size="15">HEX ${k.hex}</tspan>
    <tspan x="${(x + 20).toFixed(1)}" dy="22" font-size="15">RGB ${rgb(k.hex).join(" ")}</tspan>
  </text>`;
      x += breedte;
      return blok;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">${blokken}
</svg>
`;
}

// ---------- Alles wegschrijven naar de projectmap ----------

async function genereer(projectMap, data) {
  const bestanden = [
    ["site/index.html", maakHtml(data)],
    ["stijlgids/stijlgids.json", JSON.stringify(data, null, 2)],
    ["stijlgids/variabelen.css", maakCss(data)],
    ["images/cover.svg", maakCoverSvg(data)],
    ["images/kleurenpalet.svg", maakPaletSvg(data)],
  ];

  for (const [pad, inhoud] of bestanden) {
    const volledig = path.join(projectMap, pad);
    await fs.mkdir(path.dirname(volledig), { recursive: true });
    await fs.writeFile(volledig, inhoud);
  }

  return bestanden.map(([pad]) => pad);
}

module.exports = {
  standaardStijlgids,
  normaliseer,
  maakHtml,
  genereer,
  fontLinksHtml,
  maakCoverSvg,
  maakPaletSvg,
};