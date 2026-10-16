// =========================================
// Facturatie: BTW-rekenwerk, controle en de PDF-opmaak van facturen en offertes
// =========================================

const BTW_TARIEVEN = [0, 9, 21];

// ---------- Hulpfuncties ----------

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function tekst(v, max = 200) {
  return typeof v === "string" ? v.slice(0, max).trim() : "";
}

function rond(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function euro(bedrag) {
  return bedrag.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
}

function korteDatum(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

// ---------- Controle: alleen geldige data opslaan ----------

function normaliseerRegel(r) {
  const btw = BTW_TARIEVEN.includes(Number(r?.btw)) ? Number(r.btw) : 21;
  const aantal = Number(r?.aantal);
  const prijsPerStuk = Number(r?.prijsPerStuk);
  return {
    omschrijving: tekst(r?.omschrijving, 200),
    aantal: Number.isFinite(aantal) && aantal > 0 ? aantal : 1,
    prijsPerStuk: Number.isFinite(prijsPerStuk) ? rond(prijsPerStuk) : 0,
    btw,
  };
}

function normaliseerDocument(invoer) {
  const d = invoer && typeof invoer === "object" ? invoer : {};
  const regels = Array.isArray(d.regels) ? d.regels.slice(0, 50).map(normaliseerRegel) : [];

  return {
    klantId: tekst(d.klantId, 60),
    projectId: d.projectId ? tekst(d.projectId, 80) : null,
    datum: tekst(d.datum, 10) || new Date().toISOString().slice(0, 10),
    vervaldatum: tekst(d.vervaldatum, 10),
    regels: regels.length ? regels : [normaliseerRegel({})],
    notities: tekst(d.notities, 2000),
  };
}

// ---------- BTW-rekenwerk ----------

function berekenTotalen(regels) {
  const perTarief = new Map();

  for (const r of regels) {
    const regelSubtotaal = r.aantal * r.prijsPerStuk;
    perTarief.set(r.btw, (perTarief.get(r.btw) || 0) + regelSubtotaal);
  }

  const btwOpbouw = [...perTarief.entries()]
    .map(([tarief, subtotaal]) => ({ tarief, subtotaal: rond(subtotaal), btw: rond(subtotaal * tarief / 100) }))
    .sort((a, b) => b.tarief - a.tarief);

  const subtotaal = rond(btwOpbouw.reduce((som, t) => som + t.subtotaal, 0));
  const btwTotaal = rond(btwOpbouw.reduce((som, t) => som + t.btw, 0));

  return { subtotaal, btwOpbouw, btwTotaal, totaal: rond(subtotaal + btwTotaal) };
}

// ---------- PDF-opmaak (factuur en offerte delen dezelfde opzet) ----------

const PAGINA_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Inter", system-ui, -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: #1A1A1A;
  padding: 48px;
}
.kop {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 48px;
}
.kop img { max-width: 140px; max-height: 64px; object-fit: contain; }
.kop__bedrijf { font-size: 13px; color: #6B6B6B; line-height: 1.6; white-space: pre-line; }
.kop__titel { text-align: right; }
.kop__titel h1 { font-size: 26px; font-weight: 700; letter-spacing: 0.02em; }
.kop__titel p { color: #6B6B6B; margin-top: 4px; }
.aan { margin-bottom: 40px; }
.aan .label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #A3A3A3; margin-bottom: 6px; }
.aan strong { font-size: 15px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
th, td { text-align: left; padding: 10px 8px; }
th { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #A3A3A3; border-bottom: 1px solid #E6E6E6; }
td { border-bottom: 1px solid #F2F2F2; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.totalen { width: 280px; margin-left: auto; }
.totalen td { border-bottom: none; padding: 4px 8px; }
.totalen .eindtotaal td { font-weight: 700; font-size: 15px; border-top: 1px solid #1A1A1A; padding-top: 10px; }
.notities { margin-top: 40px; color: #6B6B6B; white-space: pre-wrap; max-width: 60ch; }
.voet { margin-top: 48px; padding-top: 16px; border-top: 1px solid #E6E6E6; color: #6B6B6B; font-size: 12px; }
`;

function maakDocumentHtml(typeLabel, doc, bedrijf, klant, logoDataUri) {
  const totalen = berekenTotalen(doc.regels);
  const bedrijfRegels = [bedrijf.bedrijfsnaam, bedrijf.adres, bedrijf.kvkNummer && `KvK ${bedrijf.kvkNummer}`, bedrijf.btwNummer && `BTW ${bedrijf.btwNummer}`]
    .filter(Boolean);

  const klantRegels = [klant?.bedrijf, klant?.naam, klant?.email].filter(Boolean);

  const regelsHtml = doc.regels.map((r) => `
    <tr>
      <td>${esc(r.omschrijving) || "—"}</td>
      <td class="num">${r.aantal}</td>
      <td class="num">${euro(r.prijsPerStuk)}</td>
      <td class="num">${r.btw}%</td>
      <td class="num">${euro(rond(r.aantal * r.prijsPerStuk))}</td>
    </tr>`).join("");

  const btwRegels = totalen.btwOpbouw.map((t) => `
    <tr><td>BTW ${t.tarief}% over ${euro(t.subtotaal)}</td><td class="num">${euro(t.btw)}</td></tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>${esc(typeLabel)} ${esc(String(doc.nummer))}</title>
<style>${PAGINA_CSS}</style>
</head>
<body>
  <header class="kop">
    <div>
      ${logoDataUri ? `<img src="${logoDataUri}" alt="">` : ""}
      <p class="kop__bedrijf" style="margin-top:12px">${bedrijfRegels.map(esc).join("\n")}</p>
    </div>
    <div class="kop__titel">
      <h1>${esc(typeLabel.toUpperCase())}</h1>
      <p>Nr. ${esc(String(doc.nummer))}</p>
      <p>${korteDatum(doc.datum)}</p>
    </div>
  </header>

  <div class="aan">
    <p class="label">Aan</p>
    <p><strong>${klantRegels.map(esc).join("<br>")}</strong></p>
  </div>

  <table>
    <thead>
      <tr><th>Omschrijving</th><th class="num">Aantal</th><th class="num">Prijs</th><th class="num">BTW</th><th class="num">Totaal</th></tr>
    </thead>
    <tbody>${regelsHtml}</tbody>
  </table>

  <table class="totalen">
    <tr><td>Subtotaal</td><td class="num">${euro(totalen.subtotaal)}</td></tr>
    ${btwRegels}
    <tr class="eindtotaal"><td>Totaal</td><td class="num">${euro(totalen.totaal)}</td></tr>
  </table>

  ${doc.notities ? `<p class="notities">${esc(doc.notities)}</p>` : ""}

  <footer class="voet">
    ${doc.vervaldatum ? `<p>${esc(typeLabel === "Factuur" ? "Te betalen vóór" : "Geldig tot")} ${korteDatum(doc.vervaldatum)}</p>` : ""}
    ${bedrijf.iban ? `<p>IBAN ${esc(bedrijf.iban)}</p>` : ""}
  </footer>
</body>
</html>
`;
}

function maakFactuurHtml(doc, bedrijf, klant, logoDataUri) {
  return maakDocumentHtml("Factuur", doc, bedrijf, klant, logoDataUri);
}

function maakOfferteHtml(doc, bedrijf, klant, logoDataUri) {
  return maakDocumentHtml("Offerte", doc, bedrijf, klant, logoDataUri);
}

module.exports = {
  BTW_TARIEVEN,
  normaliseerDocument,
  berekenTotalen,
  maakFactuurHtml,
  maakOfferteHtml,
};
