// =========================================
// Inlogpagina
// =========================================

function esc(tekst) {
  return String(tekst ?? "").replace(/[&<>"']/g, (t) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[t]));
}

async function api(url, opties = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opties,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.fout || "Er ging iets mis.");
  return data;
}

const inhoud = document.getElementById("login-inhoud");

function wireForm(url) {
  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const foutEl = form.querySelector(".form-fout");
    const knop = form.querySelector('[type="submit"]');
    foutEl.hidden = true;
    knop.disabled = true;

    try {
      await api(url, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      window.location.href = "/";
    } catch (fout) {
      foutEl.textContent = fout.message;
      foutEl.hidden = false;
      knop.disabled = false;
    }
  });
}

function renderSetup() {
  inhoud.innerHTML = `
    <div class="login-kop">
      <h1>Eerste beheerder aanmaken</h1>
      <p class="muted klein">Er is nog niemand aangemaakt. Dit account wordt automatisch beheerder.</p>
    </div>
    <form class="login-form" id="login-form" novalidate>
      <label class="veld">
        <span>Naam</span>
        <input name="naam" type="text" required autocomplete="name">
      </label>
      <label class="veld">
        <span>E-mail</span>
        <input name="email" type="email" required autocomplete="email">
      </label>
      <label class="veld">
        <span>Wachtwoord</span>
        <input name="wachtwoord" type="password" required minlength="8" autocomplete="new-password">
      </label>
      <p class="form-fout" hidden></p>
      <button class="btn btn--primary" type="submit">Beheerder aanmaken</button>
    </form>
  `;
  wireForm("/api/setup");
}

function renderInloggen() {
  inhoud.innerHTML = `
    <div class="login-kop">
      <h1>Inloggen</h1>
      <p class="muted klein">Log in met je e-mailadres en wachtwoord.</p>
    </div>
    <form class="login-form" id="login-form" novalidate>
      <label class="veld">
        <span>E-mail</span>
        <input name="email" type="email" required autocomplete="email">
      </label>
      <label class="veld">
        <span>Wachtwoord</span>
        <input name="wachtwoord" type="password" required autocomplete="current-password">
      </label>
      <p class="form-fout" hidden></p>
      <button class="btn btn--primary" type="submit">Inloggen</button>
    </form>
  `;
  wireForm("/api/login");
}

async function start() {
  try {
    const sessie = await api("/api/sessie");
    if (sessie.ingelogd) {
      window.location.href = "/";
      return;
    }

    const { heeftGebruikers } = await api("/api/setup-status");
    if (heeftGebruikers) renderInloggen();
    else renderSetup();
  } catch (fout) {
    inhoud.innerHTML = `<p class="form-fout">${esc(fout.message)}</p>`;
  }
}

start();
