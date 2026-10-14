# Studio Dashboard (stijlgids-app)

Lokaal gebouwde app om websiteprojecten voor klanten te beheren en per project een stijlgids
(kleuren, fonts, knoppen, merkinfo) te maken. Uit de stijlgids genereert de app een
stijlgids-website, PDF, PNG's en CSS. Oorspronkelijk gemaakt door Siem voor zijn portfolio.

**Richting (sinds okt 2026):** deze app wordt het interne dashboard van Siem's eigen bedrijf
(naam nog niet bepaald — in te stellen via Instellingen zodra bekend). Blijft dezelfde
basis (projecten/klanten/stijlgidsen), maar heeft er een login-systeem met gebruikersrollen
bij gekregen zodat collega's kunnen inloggen (zie Stap 9 hieronder). Moet uiteindelijk ook
online/op een server kunnen draaien, niet alleen lokaal.

**Eigen merkaccent + profiel-stijl (okt 2026):** geïnspireerd op een bank-dashboard-voorbeeld
(zachte pastelkaarten, groot profiel bovenin de zijbalk) is er een eigen indigo accentkleur
gekozen en is de zijbalk uitgebreid met een profielblok. Zie "Stijl van de app" hieronder.

## Werkwijze met mij

- Praat Nederlands, simpel en kort. Ik ben student en leer nog.
- Werk stap voor stap. Leg na elke stap kort uit wat er veranderd is en hoe ik het test.
- Code-namen (variabelen, functies, CSS-klassen) zijn Nederlands, zoals in de bestaande code.
- Geen frameworks of build-stap: gewoon HTML, CSS en JavaScript in de browser, Node.js + Express op de server.
- Na wijzigingen aan server.js, stijlgids.js of export.js moet de server herstart worden. Zeg dat erbij.
- Stel een commit-bericht voor als een stap werkt, maar push niet zonder te vragen.
- Bij grotere, veiligheidsgevoelige features (zoals het inlogsysteem) eerst een kort plan
  voorleggen voordat er code komt, in plaats van meteen te bouwen.

## Starten

npm install
npm start          → http://localhost:3000

## Mappen

server.js          Express-server: API voor projecten, bestanden, klanten, instellingen en stijlgids
stijlgids.js       Standaard stijlgids, normaliseer() (controle/migratie) en het genereren van
                   site/index.html, variabelen.css, stijlgids.json, cover.svg, kleurenpalet.svg
export.js          Puppeteer: maakt stijlgids.pdf, cover.png en kleurenpalet.png
public/index.html  De app (zijbalk + hoofdvlak)
public/css/style.css  Alle styling, met design tokens bovenaan in :root
public/js/app.js   Navigatie, dashboard, projecten, stijlgidsen, klanten, instellingen, pop-ups
public/js/editor.js  Stijlgids-editor met live voorbeeld (iframe); generiek voor project én
                   standaard-stijlgids (zie `stijlgidsBron`)
projecten/<id>/    Per project: project.json, site/, images/, documenten/, stijlgids/, .prullenbak/
data/klanten.json       Alle klanten
data/instellingen.json  Studionaam (later: bedrijfsnaam)
data/logo.<ext>         Geüpload logo, geserveerd via /api/instellingen/logo (niet statisch)
data/stijlgids-standaard.json  Standaard stijlgids voor nieuwe projecten (optioneel)

projecten/ en data/ staan in .gitignore (klantgegevens, en straks wachtwoorden/gebruikers). node_modules/ ook.

## Belangrijke afspraken in de code

- Project-id = slug van de naam (maakSlug). Mapnaam verandert nooit, ook niet bij hernoemen.
- Statussen: nog-beginnen, bezig, wacht-op-klant, klaar.
- project.json bevat: naam, klant, klantId, status, deadline, omschrijving, aangemaakt, bijgewerkt.
  cover en stijl worden niet opgeslagen maar elke keer berekend (projectExtra).
- Klanten worden automatisch aangemaakt als je bij een project een nieuwe klantnaam typt
  (zoekOfMaakKlant). Hernoemen van een klant past de naam in al zijn projecten aan.
  Een klant met projecten kan niet verwijderd worden.
- Uploads: afbeeldingen → images/, al het andere → documenten/. Nooit naar site/:
  site/index.html wordt altijd gegenereerd uit de stijlgids.
- Verwijderen van bestanden = verplaatsen naar .prullenbak/ in de projectmap.
- Stijlgids-data: naam, slogan, context {over, doelgroep, missie, visie, kernwaarden, toon,
  doen, nietDoen}, kleuren [{naam, hex, gebruik}], rollen {achtergrond, tekst, hoofd, tweede}
  (indexen in kleuren), fonts [{font, rol, gebruik}] (1–6, rol: koppen/tekst/sier/logo/hand/accent),
  knoppen {radius (999 = pil), primair, secundair, link}.
  Altijd door normaliseer() halen voor opslaan. Oude vormen (intro, fonts als object) worden omgezet.
  editor.js heeft maakVolledig() als vangnet aan de client-kant.
- FONT_ROLLEN en CONTEXT_VELDEN staan zowel in stijlgids.js als in editor.js: houd ze gelijk.
- Opslaan van een stijlgids maakt alle bestanden opnieuw (genereer + maakExports) — behalve de
  standaard-stijlgids (data/stijlgids-standaard.json): die slaat alleen op, zonder naam/context
  en zonder bestanden te genereren.
- Nieuwe projecten, en projecten zonder eigen stijlgids.json, gebruiken standaardOfAppStandaard()
  in server.js: eerst data/stijlgids-standaard.json, anders de vaste standaardStijlgids() uit
  stijlgids.js.
- Navigatie in app.js via gaNaar(pagina, projectId, { nieuweModus, klantId }), met eigen
  terug/vooruit-geschiedenis. render() kiest de juiste render-functie.
- Klikken gaan via event delegation op #content met data-attributen (data-project, data-klant, ...).
- Verwijderknoppen vragen bevestiging met bevestigKlik() ("Zeker?").
- Iconen: Lucide via unpkg (lucide@0.454.0), na elke render lucide.createIcons().
- Pop-ups via openModal({ kop, inhoud, knop, opslaan }).

## Stijl van de app

Neutraal en rustig, gebaseerd op Dribbble-voorbeelden: lichtgrijze zijbalk (#EFEFEF), hoofdvlak
#F7F7F7 met afgeronde hoek linksboven, kaarten #FAFAFA/wit met dunne randen (#E6E6E6), font Inter,
primaire knoppen zwart (#1A1A1A).

Eigen merkaccent (sinds okt 2026): `--accent: #6C5CE7` (indigo/violet) met `--accent-soft:
#EEEBFC` als lichte achtergrond — vervangt de generieke iOS-blauwe accent van hiervoor. Gebruikt
voor chips, badges, focus-rings, de schuifjes in de editor en het logo-mark-gradient in de
zijbalk (`linear-gradient(135deg, var(--accent), #4C3FC2)`). Losstaand van de statuskleuren
hieronder — die hebben een vaste betekenis en blijven ongemoeid.

Statuskleuren (vaste betekenis, niet aankomen zonder expliciet te vragen): groen klaar,
blauw bezig, geel nog beginnen, rood wacht op klant.

Dashboard-statkaarten (`.stat`) hebben sinds okt 2026 een pastel achtergrond via `kaartKleur`
(apart van `kleur`, dat alleen de kleine rij binnenin kleurt — zie `statKaart()` in app.js).
Zo kan een kaart neutraal blijven terwijl de kleine stat erin wel een kleur heeft (zoals
"Totaal projecten" met een rode "Wacht op klant"-regel).

Profiel van de ingelogde gebruiker staat bovenin de zijbalk (`.sidebar__profiel`, groot rond
avatarrondje + naam + rol), geïnspireerd op een bank-dashboard-voorbeeld. "Uitloggen" staat
onderaan de zijbalk, los vastgepind met `margin-top: auto` op `.sidebar__voet`.

Editor-panelen zijn uitklapbaar (details/summary) met label links en invoer rechts.
Gebruik altijd de tokens uit :root in style.css, geen losse kleuren.

De gegenereerde stijlgids-site gebruikt juist de kleuren en fonts van het merk van de klant
(cover met vormen, kleurenpalet, typografie, knoppen, missie/visie, kernwaarden, tone of voice).
Dat blijft los van de eigen merkkleur van het dashboard hierboven.

## Status

Klaar: stap 1–11 (basis, server met mappen, dashboard, projectpagina met uploads, stijlgids-editor
met live voorbeeld, PDF/PNG-export, flexibele fonts + kopjes over het merk, pagina's Projecten,
Stijlgidsen en Klanten, Instellingen met studionaam/logo/standaard-stijlgids/opslagpaden,
inloggen + rollen, fijnmazige rechten per rol, bestanden bij een klant).

Geparkeerd: de PDF moet later een andere opzet krijgen (Siem bepaalt nog hoe, mogelijk liggende
"borden" zoals een brand-guidelines-presentatie). Niet zelf aanpassen zonder te vragen.

Volgende (in deze volgorde afgesproken): facturen & offertes (echte, verstuurbare facturen
met BTW/nummering/bedrijfsgegevens) → website-preview per project (de echte, los gebouwde
site uploaden en bekijken, incl. mappenstructuur) → menu opdelen in gegroepeerde categorieën.

## Stap 11: Bestanden bij een klant (klaar, okt 2026)

Een klant heeft nu, net als een project, een eigen bestandenmap: `data/klanten/<klant-id>/`
met `images/` en `documenten/` (geen `stijlgids`/`site` — niet van toepassing bij een klant).

- **Belangrijk verschil met projectbestanden: klantbestanden zijn NIET publiek.**
  Projectbestanden staan onder de statische `/projecten`-route (bewust, voor het delen van
  de stijlgids-site met klanten). Klantbestanden (facturen, contracten) gaan via
  `GET /api/klanten/:id/bestanden/:map/:naam` — een gewone, ingelogde route (geen
  `express.static`), dus automatisch afgeschermd door `vereistIngelogd`. Nieuwe
  bestanden/mappen hieraan toevoegen: nooit per ongeluk via `express.static` publiek maken.
- Server.js: `klantPad(id)` (mirrort `projectPad`), `uploadKlant` (tweede multer-instance,
  mirrort `upload`), routes onder "API: klantbestanden". Schrijvende routes achter
  `vereistRecht("klanten")`; lezen (lijst + los bestand) blijft open voor elke ingelogde
  gebruiker. Verwijderen = naar `.prullenbak/` in de klantmap, zelfde patroon als projecten.
  Een klant verwijderen raakt zijn bestandenmap niet aan (geen auto-opruiming).
- app.js: `mapPaneel(key, map, bron)` is generiek gemaakt (was hardcoded aan de globale
  `bestanden`) zodat zowel projecten als klanten 'm kunnen gebruiken. De dropzone/upload/
  verwijder-handlers zijn context-bewust: ze kijken naar `openKlantId` om te kiezen tussen
  de klant- of project-variant (dezelfde DOM-ids `#dropzone`/`#upload-input`/`[data-verwijder]`
  kunnen hergebruikt worden omdat een project- en klantpagina nooit tegelijk in `#content`
  staan).

## Stap 10: Fijnmazige rechten per rol (klaar, okt 2026)

Beheerder kan bij "Gebruikers" nu instellen wat de rol Medewerker mag aanpassen. Vier
rechten (`projecten`, `klanten`, `stijlgidsen`, `instellingen`), standaard allemaal aan.
Beheerder zelf is niet instelbaar (kan altijd alles, voorkomt zelf-buitensluiting).

- `data/rechten.json`: plat object met de vier rechten (alleen voor medewerker). Ontbrekend
  bestand of ontbrekende sleutel → `true` (bestaand gedrag blijft hetzelfde totdat een
  beheerder iets uitzet). `leesRechten()`/`schrijfRechten()`/`rechtenVoor(gebruiker)` in
  server.js.
- `vereistRecht(naam)` middleware, toegepast op de schrijvende routes (GETs blijven altijd
  open — bekijken mag iedereen die is ingelogd): project/klant aanmaken/bewerken/verwijderen,
  bestanden uploaden/verwijderen → `projecten`; klant-CRUD → `klanten`; stijlgids opslaan
  (`PUT /api/projecten/:id/stijlgids`) → `stijlgidsen`; instellingen/logo/standaard-stijlgids
  → `instellingen`. Nieuw: `GET/PATCH /api/rechten` (beheerder-only).
- `GET /api/sessie` geeft `gebruiker.rechten` mee (voor beheerder altijd alles `true`).
  Frontend-helper `magIk(naam)` in app.js (`ingelogdeGebruiker?.rechten?.[naam] !== false`).
- UI-gating is bewust licht: alleen de belangrijkste knoppen (Nieuw project, Nieuwe klant,
  stijlgids-opslaan, Instellingen-bewerkknoppen) worden verborgen/uitgeschakeld. Kleinere
  acties (status wijzigen, bestand verwijderen) blijven zichtbaar in de UI maar worden wel
  door de server geblokkeerd met een foutmelding — de server is de echte grens, niet de UI.

## Stap 9: Inloggen en rollen (klaar, okt 2026)

Login-systeem met sessies (`express-session`) en twee vaste rollen: `beheerder` en
`medewerker`. Alleen beheerders kunnen bij "Gebruikers" rollen aanpassen of andere
gebruikers aanmaken/verwijderen.

- `data/gebruikers.json`: lijst met `{ id, naam, email, wachtwoordHash, rol, aangemaakt }`.
  Wachtwoorden worden gehasht met Node's ingebouwde `crypto.scrypt` (salt + hash als
  `"<salt>:<hash>"`), geen aparte dependency nodig.
- `data/sessie-sleutel.txt`: willekeurige sessie-secret, bij eerste start aangemaakt met
  `crypto.randomBytes` en daarna hergebruikt. Nooit hardcoded in de code.
- Zolang `data/gebruikers.json` leeg is, toont `public/login.html` een setup-formulier in
  plaats van een inlogformulier (`GET /api/setup-status`, `POST /api/setup`) — zo komt er
  nooit een standaardwachtwoord in de code te staan.
- Middleware in server.js: `vereistIngelogd` (op alle `/api/*` behalve login/setup/sessie,
  via `OPEN_API_PADEN`) en `vereistBeheerder` (extra, alleen op `/api/gebruikers*`). Let op:
  `req.path` binnen `app.use("/api", vereistIngelogd)` is al zonder het `/api`-voorvoegsel
  (Express-mount-gedrag) — de middleware vergelijkt daarom met `req.originalUrl`.
  `/api/account/wachtwoord` laat een ingelogde gebruiker zijn eigen wachtwoord wijzigen.
  Simpele in-memory rate limiter op `/api/login` (max 5 pogingen per e-mail per minuut).
  De gegenereerde klant-stijlgids-sites onder `/projecten/.../site/index.html` blijven
  bewust publiek (dat zijn de deliverables die je met klanten deelt) — alleen de API en de
  dashboard-SPA zitten achter login.
- Login is een losse pagina (`public/login.html` + `public/js/login.js`), niet verweven met
  de SPA. De `api()`-helper in app.js stuurt bij een `401` automatisch door naar
  `/login.html`.
- Zijbalk: `toepassenProfiel()` in app.js vult het profielblok en verbergt het nav-item
  "Gebruikers" voor niet-beheerders. Let op: `.nav__item[hidden] { display: none; }` is
  nodig in style.css — zonder die regel wint `.nav__item`'s `display:flex` van het
  `hidden`-attribuut (gelijke CSS-specificiteit, class-regel staat later in het bestand).
- `.gitignore` toegevoegd (`node_modules/`, `data/`, `projecten/`) zodat wachtwoord-hashes
  en klantgegevens nooit in git terechtkomen.
