// =========================================
// Exports: PDF van de stijlgids en PNG-afbeeldingen
// Gebruikt Puppeteer (een onzichtbare Chrome)
// =========================================

const path = require("path");
const { pathToFileURL } = require("url");
const puppeteer = require("puppeteer");
const { fontLinksHtml, maakCoverSvg, maakPaletSvg } = require("./stijlgids");

// Eén browser die we blijven hergebruiken (sneller)
let browserBelofte = null;

function getBrowser() {
  if (!browserBelofte) {
    browserBelofte = puppeteer.launch({ headless: true }).catch((fout) => {
      browserBelofte = null;
      throw fout;
    });
  }
  return browserBelofte;
}

async function wachtOpFonts(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

// SVG met de juiste fonts openen en er een scherpe PNG van maken
async function svgNaarPng(browser, data, svg, breedte, hoogte, doel) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: breedte, height: hoogte, deviceScaleFactor: 2 });
    await page.setContent(
      `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        ${fontLinksHtml(data)}
        <style>html, body { margin: 0; } svg { display: block; }</style>
      </head>
      <body>${svg}</body>
      </html>`,
      { waitUntil: "networkidle0", timeout: 30000 }
    );
    await wachtOpFonts(page);
    await page.screenshot({ path: doel, clip: { x: 0, y: 0, width: breedte, height: hoogte } });
  } finally {
    await page.close();
  }
}

async function maakExports(projectMap, data) {
  const browser = await getBrowser();
  const gemaakt = [];

  // 1. PDF van de stijlgids-website
  const page = await browser.newPage();
  try {
    const site = pathToFileURL(path.join(projectMap, "site", "index.html")).href;
    await page.goto(site, { waitUntil: "networkidle0", timeout: 30000 });
    await wachtOpFonts(page);
    await page.pdf({
      path: path.join(projectMap, "documenten", "stijlgids.pdf"),
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    gemaakt.push("documenten/stijlgids.pdf");
  } finally {
    await page.close();
  }

  // 2. Cover als PNG
  await svgNaarPng(browser, data, maakCoverSvg(data), 1200, 630,
    path.join(projectMap, "images", "cover.png"));
  gemaakt.push("images/cover.png");

  // 3. Kleurenpalet als PNG
  await svgNaarPng(browser, data, maakPaletSvg(data), 1200, 420,
    path.join(projectMap, "images", "kleurenpalet.png"));
  gemaakt.push("images/kleurenpalet.png");

  return gemaakt;
}

async function sluitBrowser() {
  if (!browserBelofte) return;
  const browser = await browserBelofte.catch(() => null);
  if (browser) await browser.close();
}

module.exports = { maakExports, sluitBrowser };