// Test navigateur du mode « données réelles » avec un faux serveur Supabase.
// Lancer : node tests/e2e/browser.test.mjs <dossier_captures>
const { chromium } = await import("playwright").catch(() => import("/opt/npm-tools/node_modules/playwright/index.mjs"));
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const out = process.argv[2] || ".";
const WEB = path.resolve("web");
const fix = readFileSync("tests/e2e/fixture.json", "utf8");
const mock = readFileSync("tests/e2e/mock-supabase.js", "utf8");
const server = http.createServer((req, res) => {
  let f = req.url.split("?")[0]; if (f === "/") f = "/index.html";
  if (f === "/config.js") { res.end('window.AEROPULSE_CONFIG={supabaseUrl:"https://test.supabase.co",supabaseAnonKey:"cle-anon",allowDemo:true};'); return; }
  try { const b = readFileSync(path.join(WEB, f)); res.setHeader("Content-Type", f.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8"); res.end(b); }
  catch { res.statusCode = 404; res.end(); }
}).listen(8765);

const failures = [];
const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) failures.push(msg); };
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 950 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.clock.setFixedTime(new Date("2026-10-02T16:00:00Z"));      // 18:00 à Paris
await page.route("**/supabase-js@*/**", (r) => r.fulfill({ contentType: "text/javascript", body: `window.__FIX=${fix};\n${mock}` }));
await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
let importBody = null;
await page.route("https://test.supabase.co/functions/v1/import-flights**", async (r) => {
  importBody = r.request().postData();
  await r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: false, lines: 3, saved: 2, rejected: 1, errors: [{ line: 3, message: "arr : aéroport inconnu « XXX »" }] }) });
});

await page.goto("http://localhost:8765/");
await page.waitForSelector("#login:not([hidden])");
check(true, "écran de connexion affiché sans session");
await page.fill("#lgEmail", "ops@exemple.fr"); await page.fill("#lgPw", "mauvais");
await page.click("#lgBtn"); await page.waitForTimeout(300);
check((await page.textContent("#lgErr")).includes("incorrect"), "mauvais mot de passe : message en français");
await page.fill("#lgPw", "bon-mot-de-passe"); await page.click("#lgBtn");
await page.waitForSelector("#login[hidden]", { state: "attached" });
await page.waitForSelector("#tiles .kpi");
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/real-ov.png` });

const tiles = await page.$$eval("#tiles .kpi", (els) => els.map((e) => e.querySelector(".label").textContent + "=" + e.querySelector(".v").textContent));
console.log("     tuiles :", tiles.join(" | "));
const brand = await page.textContent("#brandSub");
check(brand.includes("Démo Orly (test)") && brand.includes("ORY"), "en-tête : client et aéroport réels (" + brand + ")");
check(await page.isHidden("#sampleTag"), "badge « Données d'exemple » masqué");
check((await page.textContent("#freshLbl")).startsWith("À jour"), "indicateur de fraîcheur : " + (await page.textContent("#freshLbl")));
check((await page.textContent("#clock")) === "18:00", "horloge à l'heure locale de l'aéroport");

// Valeurs attendues = fonction SQL kpi_summary à 18:00 (même définitions, testé par tests/db.test.mjs).
const expected = JSON.parse(process.env.EXPECTED_KPI || "{}");
if (expected.otp_dep != null) {
  const v = (lbl) => tiles.find((t) => t.startsWith(lbl)).split("=")[1];
  check(v("Ponctualité départ") === (expected.otp_dep * 100).toFixed(1) + "%", "tuile ponctualité départ = serveur (" + (expected.otp_dep * 100).toFixed(1) + " %)");
  check(v("Ponctualité arrivée") === (expected.otp_arr * 100).toFixed(1) + "%", "tuile ponctualité arrivée = serveur");
  check(v("Mouvements") === String(expected.movements), "tuile mouvements = serveur (" + expected.movements + ")");
  check(v("Risque couvre-feu").startsWith(String(expected.curfew_risk)), "tuile couvre-feu = serveur (" + expected.curfew_risk + ")");
}
const reasons = await page.$$eval("#reasons .bar", (e) => e.length);
check(reasons >= 3, "retards par motif issus des codes transmis (" + reasons + ")");
const planes = await page.$$eval("#mapDyn path", (e) => e.length);
check(planes > 0, "carte : " + planes + " avions en vol");

for (const ws of ["fl", "wx", "ap", "bm", "al"]) {
  await page.click(`nav button[data-ws="${ws}"]`); await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/real-${ws}.png` });
}
await page.click('nav button[data-ws="wx"]');
check((await page.$$eval(".wx-card", (e) => e.length)) === 3, "météo : 3 METAR réels affichés");
check((await page.textContent(".wx-card .raw")).includes("reçu à 17:30"), "météo : heure de réception locale");
await page.click('nav button[data-ws="bm"]');
const bm = await page.$$eval(".heat tbody tr", (e) => e.length);
check(bm === 4, "benchmark : 4 compagnies");

await page.click('nav button[data-ws="fl"]'); await page.waitForTimeout(300);
const rowsDep = await page.$$eval(".flights tbody tr", (e) => e.length);
check(rowsDep > 0, "liste des départs : " + rowsDep + " lignes");
check(await page.isVisible("#impBtn"), "bouton d'import visible pour un éditeur");
await page.setInputFiles("#impFile", { name: "vols.csv", mimeType: "text/csv", buffer: Buffer.from("vol;origine;destination;std\nSX1;ORY;NCE;2026-10-02T20:00+02:00\n") });
await page.waitForSelector(".imp"); await page.waitForTimeout(300);
const imp = await page.textContent(".imp");
check(importBody && importBody.includes("SX1"), "import : fichier envoyé à la fonction serveur");
check(imp.includes("2 vols enregistrés") && imp.includes("Ligne 3"), "import : résultat et erreurs affichés");
await page.screenshot({ path: `${out}/real-import.png` });

// Téléphone
await page.setViewportSize({ width: 400, height: 860 });
await page.click('nav button[data-ws="ov"]'); await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/real-phone.png`, fullPage: false });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check(!overflow, "téléphone : pas de défilement horizontal");
const lo = await page.$eval("#logoutBtn", (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right <= window.innerWidth; });
check(lo, "téléphone : bouton de déconnexion visible");

check(await page.$eval("#shareBtn", (e) => e.hidden), "partage : bouton masqué pour un éditeur");

// Administrateur : création d'un accès invité
async function scenario(init) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript(init);
  await p.clock.setFixedTime(new Date("2026-10-02T16:00:00Z"));
  await p.route("**/supabase-js@*/**", (r) => r.fulfill({ contentType: "text/javascript", body: `window.__FIX=${fix};\n${mock}` }));
  await p.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  return p;
}
const pa = await scenario(() => { window.__ROLE = "admin"; });
const calls = [];
await pa.route("https://test.supabase.co/functions/v1/guest-access", async (r) => {
  const q = JSON.parse(r.request().postData()); calls.push(q.action);
  const body = q.action === "create" ? { ok: true, user_id: "g1", username: "invite-k7m3qp", password: "Kq7m-Xp4t-R9wz", minutes: 120, activate_before: "2026-10-09T16:00:00Z" }
    : { ok: true, guests: [{ user_id: "g0", guest_username: "invite-abcd23", label: "Air Test", state: "active", first_login_at: "2026-10-02T15:00:00Z", expires_at: "2026-10-02T17:00:00Z", activate_before: "2026-10-09T00:00:00Z" }] };
  await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
});
await pa.goto("http://localhost:8765/"); await pa.waitForSelector("#login:not([hidden])");
await pa.fill("#lgEmail", "admin@exemple.fr"); await pa.fill("#lgPw", "bon-mot-de-passe"); await pa.click("#lgBtn");
await pa.waitForSelector("#tiles .kpi");
check(!(await pa.$eval("#shareBtn", (e) => e.hidden)), "partage : bouton visible pour un administrateur");
await pa.click("#shareBtn"); await pa.waitForSelector("#shList .glist");
check((await pa.textContent("#shList")).includes("invite-abcd23"), "partage : liste des invitations");
await pa.fill("#shLabel", "Air Algérie"); await pa.click("#shCreate"); await pa.waitForSelector("#shCreds");
check((await pa.textContent("#shUser")) === "invite-k7m3qp" && (await pa.textContent("#shPw")) === "Kq7m-Xp4t-R9wz", "partage : identifiant et mot de passe affichés");
check(calls.includes("create"), "partage : demande envoyée au serveur");
await pa.screenshot({ path: `${out}/share.png` });
await pa.close();

// Invité : connexion avec l'identifiant seul, compte à rebours, fin d'accès
const pg = await scenario(() => { window.__GUEST_EXP = new Date(Date.parse("2026-10-02T16:00:00Z") + 107 * 60000).toISOString(); });
let loginEmail = null;
await pg.addInitScript(() => {});
await pg.goto("http://localhost:8765/"); await pg.waitForSelector("#login:not([hidden])");
await pg.fill("#lgEmail", "invite-k7m3qp"); await pg.fill("#lgPw", "bon-mot-de-passe"); await pg.click("#lgBtn");
await pg.waitForSelector("#tiles .kpi"); await pg.waitForTimeout(1500);
loginEmail = await pg.evaluate(() => document.getElementById("lgEmail").value);
check(!(await pg.$eval("#guestChip", (e) => e.hidden)) && (await pg.textContent("#guestLbl")).includes("1 h 47"), "invité : compte à rebours affiché (" + (await pg.textContent("#guestLbl")) + ")");
check(await pg.$eval("#shareBtn", (e) => e.hidden), "invité : pas de bouton Partager");
await pg.clock.setFixedTime(new Date("2026-10-02T17:48:00Z")); await pg.waitForTimeout(1500);
check((await pg.textContent("main")).includes("Accès de démonstration terminé"), "invité : écran de fin d'accès à l'expiration");
await pg.close();

check(errs.length === 0, "aucune erreur JavaScript" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close(); server.close();
console.log(failures.length ? `\n${failures.length} échec(s)` : "\nTous les contrôles passent.");
process.exit(failures.length ? 1 : 0);
