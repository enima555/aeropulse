// Prépare les données servies par le faux serveur Supabase du test navigateur.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseFlightsCsv } from "../../supabase/functions/_shared/flights_csv.ts";
const q = (s) => execFileSync("psql", ["-X", "-q", "-A", "-t", "-c", s], { encoding: "utf8" }).trim();
const ap = JSON.parse(q("select json_agg(json_build_array(icao, iata)) from airports"));
const icao = new Set(ap.map((x) => x[0])), iata = new Map(ap.filter((x) => x[1]).map((x) => [x[1], x[0]]));
const T = "11111111-1111-1111-1111-111111111111";
const { rows } = parseFlightsCsv(readFileSync("samples/demo_LFPO_2026-10-02.csv", "utf8"), (c) => (icao.has(c) ? c : iata.get(c) ?? null), T);
const flights = rows.map((r, i) => ({ id: `f${String(i).padStart(4, "0")}`, updated_at: "2026-10-02T15:58:00Z", ...r }));
const codes = [...new Set(flights.flatMap((f) => [f.dep_airport, f.arr_airport]))].map((c) => `'${c}'`).join(",");
const airports = JSON.parse(q(`select json_agg(a) from airports a where icao in (${codes})`));
const delay = JSON.parse(q("select json_agg(json_build_object('code', code, 'label', label)) from delay_codes"));
writeFileSync("tests/e2e/fixture.json", JSON.stringify({
  tenant: { id: T, name: "Démo Orly (test)", kind: "demo", home_airport: "LFPO", airline_iata: null },
  flights, airports, delay,
  metar: [
    { station: "LFPO", observed_at: "2026-10-02T15:30:00Z", raw: "LFPO 021530Z 22014KT 9999 -SHRA FEW018 BKN035 14/10 Q1012 NOSIG" },
    { station: "LFMN", observed_at: "2026-10-02T15:30:00Z", raw: "LFMN 021530Z 04015G28KT 8000 TSRA SCT040CB 20/14 Q1010" },
    { station: "LPPT", observed_at: "2026-10-02T15:30:00Z", raw: "LPPT 021530Z 33012KT CAVOK 19/13 Q1020" },
  ],
}));
console.log("fixture:", flights.length, "vols,", airports.length, "aéroports");
