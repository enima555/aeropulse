// Tests base de données : import, parité des KPI serveur/application, cloisonnement entre clients.
// Prérequis : une base PostgreSQL avec tests/local_bootstrap.sql puis supabase/migrations/*.sql
// (variables PGHOST, PGPORT, PGUSER, PGDATABASE). Lancer :
//   node --experimental-strip-types --test tests/db.test.mjs
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseFlightsCsv } from "../supabase/functions/_shared/flights_csv.ts";
const AeroKPI = createRequire(import.meta.url)("../web/kpi.js");

const T1 = "11111111-1111-1111-1111-111111111111", T2 = "22222222-2222-2222-2222-222222222222";
const UA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", UB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function sql(q, user) {
  const wrapped = user
    ? `begin; set local role authenticated; set local "request.jwt.claim.sub" = '${user}'; ${q}; commit;`
    : q;
  return execFileSync("psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", wrapped], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

let rows;
before(() => {
  sql(`delete from flights; delete from memberships; delete from tenants;
       insert into auth.users (id, email) values (${lit(UA)}, 'a@test.fr'), (${lit(UB)}, 'b@test.fr') on conflict do nothing;
       insert into tenants (id, name, kind, home_airport) values (${lit(T1)}, 'Démo Orly', 'demo', 'LFPO'), (${lit(T2)}, 'Autre client', 'airline', 'DAAG');
       insert into memberships (tenant_id, user_id, role) values (${lit(T1)}, ${lit(UA)}, 'admin'), (${lit(T2)}, ${lit(UB)}, 'viewer');`);
  const ap = JSON.parse(sql(`select json_agg(json_build_array(icao, iata)) from airports`));
  const byIcao = new Set(ap.map((x) => x[0])), byIata = new Map(ap.filter((x) => x[1]).map((x) => [x[1], x[0]]));
  const res = parseFlightsCsv(readFileSync("samples/demo_LFPO_2026-10-02.csv", "utf8"), (c) => (byIcao.has(c) ? c : byIata.get(c) ?? null), T1);
  assert.equal(res.errors.length, 0);
  rows = res.rows;
  // Import avec les droits d'un admin du client (comme la fonction import-flights).
  sql(`insert into flights select * from jsonb_populate_recordset(null::flights,
         (select jsonb_agg(r || jsonb_build_object('id', gen_random_uuid(), 'updated_at', now())) from jsonb_array_elements(${lit(JSON.stringify(rows))}::jsonb) r))`, UA);
});

test("import : les 128 vols sont en base pour le client", () => {
  assert.equal(sql(`select count(*) from flights where tenant_id = ${lit(T1)}`, UA), "128");
});

const CURFEW = { last_offblock: "23:15", last_landing: "23:30" };
const KEYS = ["dep_scheduled", "dep_done", "dep_on_time", "otp_dep", "arr_done", "arr_on_time", "otp_arr", "movements", "scheduled",
  "cancelled", "regularity", "delay_minutes", "avg_delay_per_dep", "taxi_out_avg", "taxi_in_avg", "pax", "load_factor", "delay_by_code", "curfew_risk"];

for (const at of ["2026-10-02T08:00:00+02:00", "2026-10-02T12:30:00+02:00", "2026-10-02T17:59:00+02:00", "2026-10-02T22:00:00+02:00"]) {
  for (const airline of [null, "SX", "OC"]) {
    test(`parité KPI serveur / application à ${at.slice(11, 16)}${airline ? " pour " + airline : ""}`, () => {
      const server = JSON.parse(sql(`select kpi_summary(${lit(T1)}, 'LFPO', '2026-10-02', ${lit(at)}, ${airline ? lit(airline) : "null"})`, UA));
      const client = AeroKPI.summary(rows, { airport: "LFPO", day: "2026-10-02", tz: "Europe/Paris", at, curfew: CURFEW, airline });
      for (const k of KEYS) {
        const s = server[k], c = client[k];
        if (typeof c === "number" && typeof s === "number") assert.ok(Math.abs(s - c) < 1e-6, `${k} : serveur ${s} ≠ application ${c}`);
        else assert.deepEqual(s ?? null, c ?? null, `${k} : serveur ${JSON.stringify(s)} ≠ application ${JSON.stringify(c)}`);
      }
    });
  }
}

test("KPI : valeurs plausibles et risque couvre-feu détecté en soirée", () => {
  const k = JSON.parse(sql(`select kpi_summary(${lit(T1)}, 'LFPO', '2026-10-02', '2026-10-02T22:00:00+02:00')`, UA));
  assert.ok(k.dep_done > 20 && k.arr_done > 20, JSON.stringify(k));
  assert.ok(k.otp_dep > 0.5 && k.otp_dep <= 1);
  assert.ok(k.curfew_risk >= 1, "au moins un vol estimé après 23:15");
  assert.ok(Object.keys(k.delay_by_code).length >= 3);
});

test("benchmark : une ligne par compagnie", () => {
  const r = sql(`select string_agg(airline_iata, ',' order by airline_iata) from kpi_by_airline(${lit(T1)}, 'LFPO', '2026-10-02', '2026-10-02T18:00:00+02:00')`, UA);
  assert.equal(r, "LB,ME,OC,SX");
});

test("sécurité : un autre client ne voit ni ne modifie les vols", () => {
  assert.equal(sql(`select count(*) from flights`, UB), "0");
  const k = JSON.parse(sql(`select kpi_summary(${lit(T1)}, 'LFPO', '2026-10-02', '2026-10-02T18:00:00+02:00')`, UB));
  assert.equal(k.dep_done, 0);
  assert.throws(() => sql(`insert into flights (tenant_id, flight_no, ops_date, dep_airport, arr_airport, std) values (${lit(T1)}, 'XX1', '2026-10-02', 'LFPO', 'LFMN', now())`, UB), /row-level security/);
  assert.equal(sql(`update flights set pax = 0 where tenant_id = ${lit(T1)} returning 1`, UB), "");
  assert.equal(sql(`select count(*) from tenants`, UB), "1");
});

test("sécurité : un lecteur ne peut pas écrire chez son propre client", () => {
  assert.throws(() => sql(`insert into flights (tenant_id, flight_no, ops_date, dep_airport, arr_airport, std) values (${lit(T2)}, 'AH1', '2026-10-02', 'DAAG', 'LFPO', now())`, UB), /row-level security/);
});

test("sécurité : un visiteur non connecté n'a accès à rien", () => {
  assert.throws(() => sql(`begin; set local role anon; select count(*) from flights; commit;`), /permission denied/);
});
