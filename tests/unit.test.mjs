// Tests unitaires du code partagé : import CSV, METAR, adaptateur AeroDataBox.
// Lancer : node --experimental-strip-types --test tests/unit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFlightsCsv, splitCsv } from "../supabase/functions/_shared/flights_csv.ts";
import { decodeMetar, metarRowsFromAwc } from "../supabase/functions/_shared/metar.ts";
import { adbToFlights, adbAirports, adbTime, localStamp } from "../supabase/functions/_shared/aerodatabox.ts";

const AIRPORTS = { LFPO: "ORY", LFMN: "NCE", LPPT: "LIS", DAAG: "ALG", TFFR: "PTP", LFBO: "TLS", LFML: "MRS", LFKJ: "AJA", LEMD: "MAD", LEBL: "BCN", LIRF: "FCO", DTTA: "TUN", GMMN: "CMN", GMMX: "RAK" };
const byIata = Object.fromEntries(Object.entries(AIRPORTS).map(([i, a]) => [a, i]));
const resolve = (c) => (AIRPORTS[c] ? c : byIata[c] ?? null);
const T = "00000000-0000-0000-0000-000000000001";

test("CSV : séparateur détecté, guillemets et BOM", () => {
  const t = splitCsv('﻿a;b;c\n1;"x;y";"il dit ""ok"""\n');
  assert.deepEqual(t, [["a", "b", "c"], ["1", "x;y", 'il dit "ok"']]);
  assert.deepEqual(splitCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
});

test("CSV : le modèle fourni s'importe sans erreur, codes IATA convertis en OACI", () => {
  const r = parseFlightsCsv(readFileSync("samples/flights_template.csv", "utf8"), resolve, T);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.rows.length, 2);
  const [a, b] = r.rows;
  assert.equal(a.flight_no, "SX312");
  assert.equal(a.std, "2026-10-03T05:40:00.000Z");
  assert.equal(a.ops_date, "2026-10-03");
  assert.equal(a.status, "airborne");                 // déduit de takeoff
  assert.deepEqual(a.delay_codes, [{ code: "93", min: 12 }]);
  assert.equal(b.dep_airport, "LFMN");                // NCE → LFMN
  assert.equal(b.arr_airport, "LFPO");
  assert.equal(b.status, "scheduled");
});

test("CSV : erreurs explicites, ligne par ligne", () => {
  const csv = [
    "vol;origine;destination;depart_prevu;arrivee_prevue;passagers;statut;codes_retard",
    "SX1;ORY;XXX;2026-10-03T07:40+02:00;2026-10-03T09:00+02:00;;;",
    "SX2;ORY;NCE;2026-10-03 07:40;;;;",
    "SX3;ORY;NCE;2026-10-03T07:40+02:00;2026-10-03T06:00+02:00;12a;volé;93-12",
    "SX4;ORY;NCE;2026-10-03T07:40+02:00;;;annulé;",
  ].join("\n");
  const r = parseFlightsCsv(csv, resolve, T);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].status, "cancelled");
  assert.match(r.errors[0].message, /aéroport inconnu « XXX »/);
  assert.match(r.errors[1].message, /fuseau obligatoire/);
  assert.match(r.errors[2].message, /antérieure/);
  assert.match(r.errors[2].message, /entier positif/);
  assert.match(r.errors[2].message, /status/);
  assert.match(r.errors[2].message, /93:25/);
  assert.deepEqual(r.errors.map((e) => e.line), [2, 3, 4]);
});

test("CSV : colonnes obligatoires manquantes", () => {
  const r = parseFlightsCsv("vol;std\nSX1;2026-10-03T07:40Z\n", resolve, T);
  assert.equal(r.rows.length, 0);
  assert.match(r.errors[0].message, /dep, arr/);
});

test("CSV : le jeu de démonstration complet est valide", () => {
  const r = parseFlightsCsv(readFileSync("samples/demo_LFPO_2026-10-02.csv", "utf8"), resolve, T);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors.slice(0, 3)));
  assert.equal(r.rows.length, 128);
});

test("METAR : décodage complet", () => {
  const o = decodeMetar("LFPO 030930Z 22014G32KT 4000 -TSRA BKN008CB OVC020 14/10 Q1012 TEMPO 1500 +TSRA");
  assert.deepEqual(o.wind, { dir: 220, spd: 14, gst: 32 });
  assert.equal(o.vis, 4000);
  assert.equal(o.ceil, 800);
  assert.equal(o.cat, "IFR");
  assert.deepEqual(o.wx, ["faible orage + pluie"]);   // la tendance TEMPO est ignorée
  assert.equal(o.t, 14); assert.equal(o.q, 1012);
  assert.ok(o.flags.some(([s, t]) => s === "bad" && /Orage/.test(t)));
  assert.ok(o.flags.some(([, t]) => /Rafales 32/.test(t)));
  assert.equal(decodeMetar("LFKJ 030930Z AUTO 05008KT CAVOK 21/12 Q1016 NOSIG").cat, "VFR");
  assert.equal(decodeMetar("KEWR 031151Z 31008KT 10SM FEW250 12/M02 A3012").q, 1020);
});

test("METAR : lecture de la réponse aviationweather.gov", () => {
  const rows = metarRowsFromAwc([
    { icaoId: "LFPO", obsTime: Date.parse("2026-10-03T09:30:00Z") / 1000, rawOb: "LFPO 030930Z 22014KT 9999 FEW018 14/10 Q1012" },
    { icaoId: "LFMN", reportTime: "2026-10-03 09:30:00", rawOb: "LFMN 030930Z 04015KT CAVOK 20/14 Q1010" },
    { icaoId: "bad", rawOb: "" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].observed_at, "2026-10-03T09:30:00.000Z");
  assert.equal(rows[1].observed_at, "2026-10-03T09:30:00.000Z");
  assert.equal(rows[0].decoded.wind.dir, 220);
});

test("AeroDataBox : conversion FIDS → vols", () => {
  const res = {
    departures: [{
      number: "TO 3412", status: "Departed", codeshareStatus: "IsOperator", isCargo: false,
      departure: { airport: { icao: "LFPO", iata: "ORY", name: "Paris Orly" }, scheduledTime: { utc: "2026-10-03 05:40Z", local: "2026-10-03 07:40+02:00" }, revisedTime: { utc: "2026-10-03 05:52Z", local: "2026-10-03 07:52+02:00" }, runwayTime: { utc: "2026-10-03 06:05Z", local: "x" }, terminal: "1", gate: "A12" },
      arrival: { airport: { icao: "LPPT", iata: "LIS", name: "Lisbon", municipalityName: "Lisbon", countryCode: "PT", timeZone: "Europe/Lisbon", location: { lat: 38.77, lon: -9.13 } }, scheduledTime: { utc: "2026-10-03 08:10Z", local: "2026-10-03 09:10+01:00" }, revisedTime: { utc: "2026-10-03 08:20Z" } },
      aircraft: { reg: "F-HTVA", model: "Boeing 737-800" }, airline: { name: "Transavia France", iata: "TO" },
    }, {
      number: "AF 9000", status: "Expected", codeshareStatus: "IsCodeshared",
      departure: { airport: { icao: "LFPO" }, scheduledTime: { utc: "2026-10-03 05:40Z" } }, arrival: { airport: { icao: "LPPT" } },
    }],
    arrivals: [{
      number: "AH1000", status: "Canceled",
      departure: { airport: { icao: "DAAG", iata: "ALG" }, scheduledTime: { utc: "2026-10-03 07:00Z", local: "2026-10-03 08:00+01:00" } },
      arrival: { airport: { icao: "LFPO" }, scheduledTime: { utc: "2026-10-03 08:20Z", local: "2026-10-03 10:20+02:00" } },
      airline: { name: "Air Algérie", iata: "AH" },
    }],
  };
  const { rows, skipped } = adbToFlights(res, "LFPO", T);
  assert.equal(skipped, 1);                            // le vol en partage de code est ignoré
  assert.equal(rows.length, 2);
  const d = rows.find((r) => r.flight_no === "TO3412");
  assert.equal(d.atd, "2026-10-03T05:52:00.000Z");     // vol parti : heure révisée = départ réel
  assert.equal(d.etd, null);
  assert.equal(d.takeoff, "2026-10-03T06:05:00.000Z");
  assert.equal(d.eta, "2026-10-03T08:20:00.000Z");
  assert.equal(d.status, "departed");
  assert.equal(d.dep_gate, "A12");
  assert.equal(d.ops_date, "2026-10-03");
  const a = rows.find((r) => r.flight_no === "AH1000");
  assert.equal(a.status, "cancelled");
  assert.equal(a.dep_airport, "DAAG");
  assert.equal(a.ops_date, "2026-10-03");
  const aps = adbAirports(res);
  assert.equal(aps.find((x) => x.icao === "LPPT").tz, "Europe/Lisbon");
  assert.equal(adbTime({ utc: "2026-10-03T05:40:00Z" }), "2026-10-03T05:40:00.000Z");
  assert.equal(localStamp(new Date("2026-10-03T05:40:00Z"), "Europe/Paris"), "2026-10-03T07:40");
});
