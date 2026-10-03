// AeroPulse · Chargement du référentiel des aéroports à vols réguliers depuis OurAirports (domaine public).
// À lancer une fois, puis de temps en temps pour mettre à jour (protégé par le secret des tâches planifiées).
import { splitCsv } from "../_shared/flights_csv.ts";
import { checkCronSecret, json, serviceClient } from "../_shared/http.ts";

const SOURCE = "https://davidmegginson.github.io/ourairports-data/airports.csv";

Deno.serve(async (req) => {
  if (!(await checkCronSecret(req))) return json(req, { error: "Accès refusé" }, 401);
  const res = await fetch(SOURCE);
  if (!res.ok) return json(req, { error: `Source indisponible (${res.status})` }, 502);
  const table = splitCsv(await res.text());
  const h = table[0];
  const col = (n: string) => h.indexOf(n);
  const [cIcao, cIata, cType, cName, cLat, cLon, cCont, cCountry, cCity, cSched] =
    ["icao_code", "iata_code", "type", "name", "latitude_deg", "longitude_deg", "continent", "iso_country", "municipality", "scheduled_service"].map(col);
  const rows = new Map<string, Record<string, unknown>>();
  for (const r of table.slice(1)) {
    const icao = (r[cIcao] ?? "").trim().toUpperCase();
    if (r[cSched] !== "yes" || !["large_airport", "medium_airport", "small_airport"].includes(r[cType])) continue;
    if (!/^[A-Z0-9]{4}$/.test(icao) || rows.has(icao)) continue;
    const iata = (r[cIata] ?? "").trim().toUpperCase();
    rows.set(icao, {
      icao, iata: /^[A-Z0-9]{3}$/.test(iata) ? iata : null, name: r[cName], city: r[cCity] || null,
      country: r[cCountry] || null, continent: r[cCont] || null, lat: Number(r[cLat]), lon: Number(r[cLon]),
    });
  }
  const sb = serviceClient(), list = [...rows.values()];
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await sb.from("airports").upsert(list.slice(i, i + 500), { onConflict: "icao" });
    if (error) return json(req, { error: error.message, done: i }, 500);
  }
  return json(req, { ok: true, airports: list.length });
});
