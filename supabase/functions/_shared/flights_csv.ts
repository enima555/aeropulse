// AeroPulse · Lecture et validation du format d'import standard des vols (CSV).
// Spécification : docs/import-format.md. Code sans dépendance, testable avec Node et Deno.

export type FlightStatus =
  | "scheduled" | "boarding" | "departed" | "airborne" | "landed" | "arrived" | "cancelled" | "diverted";

export interface FlightRow {
  tenant_id: string;
  source: string;
  flight_no: string;
  ops_date: string;
  airline_iata: string | null;
  airline_name: string | null;
  dep_airport: string;
  arr_airport: string;
  std: string | null; sta: string | null;
  etd: string | null; eta: string | null;
  atd: string | null; takeoff: string | null; landing: string | null; ata: string | null;
  status: FlightStatus;
  aircraft_type: string | null;
  registration: string | null;
  seats: number | null;
  pax: number | null;
  dep_terminal: string | null; dep_gate: string | null; dep_stand: string | null;
  arr_terminal: string | null; arr_gate: string | null; arr_stand: string | null;
  delay_codes: { code: string; min: number }[];
}

export interface RowError { line: number; message: string }
export interface ParseResult { rows: FlightRow[]; errors: RowError[]; total: number }

/** Renvoie le code OACI d'un aéroport à partir d'un code OACI ou IATA, ou null s'il est inconnu. */
export type AirportResolver = (code: string) => string | null;

const ALIASES: Record<string, string[]> = {
  flight_no: ["flight_no", "flight", "vol", "numero_vol", "no_vol"],
  airline_iata: ["airline_iata", "airline", "cie", "compagnie_iata", "code_compagnie"],
  airline_name: ["airline_name", "compagnie", "nom_compagnie"],
  dep: ["dep", "dep_airport", "from", "origine", "depart", "aeroport_depart"],
  arr: ["arr", "arr_airport", "to", "destination", "arrivee", "aeroport_arrivee"],
  std: ["std", "depart_prevu", "sobt"],
  sta: ["sta", "arrivee_prevue", "sibt"],
  etd: ["etd", "depart_estime", "eobt"],
  eta: ["eta", "arrivee_estimee", "eibt"],
  atd: ["atd", "aobt", "depart_reel"],
  takeoff: ["takeoff", "atot", "decollage"],
  landing: ["landing", "aldt", "atterrissage"],
  ata: ["ata", "aibt", "arrivee_reelle"],
  status: ["status", "statut"],
  aircraft_type: ["aircraft_type", "type", "type_avion", "avion"],
  registration: ["registration", "reg", "immat", "immatriculation"],
  seats: ["seats", "sieges", "capacite"],
  pax: ["pax", "passagers"],
  dep_terminal: ["dep_terminal", "terminal_depart", "terminal"],
  dep_gate: ["dep_gate", "porte_depart", "porte", "gate"],
  dep_stand: ["dep_stand", "poste_depart", "poste", "stand"],
  arr_terminal: ["arr_terminal", "terminal_arrivee"],
  arr_gate: ["arr_gate", "porte_arrivee"],
  arr_stand: ["arr_stand", "poste_arrivee"],
  delay_codes: ["delay_codes", "codes_retard", "motifs"],
};

const STATUS: Record<string, FlightStatus> = {
  scheduled: "scheduled", programme: "scheduled", prevu: "scheduled",
  boarding: "boarding", embarquement: "boarding",
  departed: "departed", parti: "departed",
  airborne: "airborne", en_vol: "airborne", "en vol": "airborne",
  landed: "landed", atterri: "landed", pose: "landed",
  arrived: "arrived", arrive: "arrived",
  cancelled: "cancelled", canceled: "cancelled", annule: "cancelled",
  diverted: "diverted", deroute: "diverted",
};

const ISO = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Découpe un CSV (guillemets, séparateur ; , ou tabulation détecté sur l'en-tête). */
export function splitCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: [string, number][] = [";", ",", "\t"].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  const sep = counts[0][1] > 0 ? counts[0][0] : ",";
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim() !== ""));
}

function parseTime(v: string, field: string): { iso: string | null; date: string | null; err?: string } {
  v = v.trim();
  if (!v) return { iso: null, date: null };
  const m = v.match(ISO);
  if (!m) return { iso: null, date: null, err: `${field} : « ${v} » doit être au format 2026-10-03T07:40+02:00 (fuseau obligatoire)` };
  const d = new Date(v.replace(" ", "T"));
  if (isNaN(d.getTime())) return { iso: null, date: null, err: `${field} : date invalide « ${v} »` };
  return { iso: d.toISOString(), date: m[1] };
}

function parseDelayCodes(v: string): { codes: { code: string; min: number }[]; err?: string } {
  v = v.trim();
  if (!v) return { codes: [] };
  const codes: { code: string; min: number }[] = [];
  for (const part of v.split(/[|;,]\s*/)) {
    if (!part.trim()) continue;
    const m = part.trim().match(/^(\d{2}[A-Z]?)\s*[:/=]\s*(\d{1,4})$/i);
    if (!m) return { codes: [], err: `delay_codes : « ${part} » doit ressembler à 93:25` };
    codes.push({ code: m[1].toUpperCase(), min: Number(m[2]) });
  }
  return { codes };
}

function intOrNull(v: string, field: string, errs: string[]): number | null {
  v = v.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) { errs.push(`${field} : « ${v} » doit être un entier positif`); return null; }
  return Number(v);
}

function deriveStatus(r: Pick<FlightRow, "atd" | "takeoff" | "landing" | "ata">): FlightStatus {
  if (r.ata) return "arrived";
  if (r.landing) return "landed";
  if (r.takeoff) return "airborne";
  if (r.atd) return "departed";
  return "scheduled";
}

export function parseFlightsCsv(text: string, resolve: AirportResolver, tenantId: string, source = "import"): ParseResult {
  const table = splitCsv(text);
  const errors: RowError[] = [];
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: "Fichier vide ou sans ligne de données" }], total: 0 };

  const header = table[0].map(norm);
  const col: Record<string, number> = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const idx = header.findIndex((h) => names.includes(h));
    if (idx >= 0) col[key] = idx;
  }
  const missing = ["flight_no", "dep", "arr"].filter((k) => col[k] === undefined);
  if (col.std === undefined && col.sta === undefined) missing.push("std ou sta");
  if (missing.length) {
    return { rows: [], errors: [{ line: 1, message: `Colonnes obligatoires absentes : ${missing.join(", ")}` }], total: table.length - 1 };
  }

  const byKey = new Map<string, FlightRow>();
  for (let i = 1; i < table.length; i++) {
    const line = i + 1;
    const cells = table[i];
    const get = (k: string) => (col[k] === undefined ? "" : (cells[col[k]] ?? "").trim());
    const errs: string[] = [];

    const flightNo = get("flight_no").toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(flightNo)) errs.push(`flight_no : « ${get("flight_no")} » n'est pas un numéro de vol valide`);
    const dep = resolve(get("dep").toUpperCase());
    if (!dep) errs.push(`dep : aéroport inconnu « ${get("dep")} »`);
    const arr = resolve(get("arr").toUpperCase());
    if (!arr) errs.push(`arr : aéroport inconnu « ${get("arr")} »`);

    const t: Record<string, string | null> = {};
    let opsDate: string | null = null;
    for (const k of ["std", "sta", "etd", "eta", "atd", "takeoff", "landing", "ata"]) {
      const p = parseTime(get(k), k);
      if (p.err) errs.push(p.err);
      t[k] = p.iso;
      if (k === "std" && p.date) opsDate = p.date;
      if (k === "sta" && p.date && !opsDate) opsDate = p.date;
    }
    if (!t.std && !t.sta) errs.push("std ou sta obligatoire");
    if (t.std && t.sta && t.sta < t.std) errs.push("sta est antérieure à std");
    if (t.atd && t.takeoff && t.takeoff < t.atd) errs.push("takeoff est antérieur à atd");
    if (t.landing && t.ata && t.ata < t.landing) errs.push("ata est antérieure à landing");

    const dc = parseDelayCodes(get("delay_codes"));
    if (dc.err) errs.push(dc.err);
    const seats = intOrNull(get("seats"), "seats", errs);
    const pax = intOrNull(get("pax"), "pax", errs);

    let status: FlightStatus;
    const rawStatus = norm(get("status")).replace(/_/g, " ");
    if (rawStatus) {
      const s = STATUS[rawStatus] ?? STATUS[rawStatus.replace(/ /g, "_")];
      if (!s) errs.push(`status : « ${get("status")} » inconnu (scheduled, boarding, departed, airborne, landed, arrived, cancelled, diverted)`);
      status = s ?? "scheduled";
    } else status = deriveStatus({ atd: t.atd, takeoff: t.takeoff, landing: t.landing, ata: t.ata });

    if (errs.length) { errors.push({ line, message: errs.join(" ; ") }); continue; }

    const opt = (k: string) => get(k) || null;
    const row: FlightRow = {
      tenant_id: tenantId, source, flight_no: flightNo, ops_date: opsDate!,
      airline_iata: (opt("airline_iata") ?? flightNo.slice(0, 2)).toUpperCase(),
      airline_name: opt("airline_name"),
      dep_airport: dep!, arr_airport: arr!,
      std: t.std, sta: t.sta, etd: t.etd, eta: t.eta, atd: t.atd, takeoff: t.takeoff, landing: t.landing, ata: t.ata,
      status, aircraft_type: opt("aircraft_type")?.toUpperCase() ?? null, registration: opt("registration")?.toUpperCase() ?? null,
      seats, pax,
      dep_terminal: opt("dep_terminal"), dep_gate: opt("dep_gate"), dep_stand: opt("dep_stand"),
      arr_terminal: opt("arr_terminal"), arr_gate: opt("arr_gate"), arr_stand: opt("arr_stand"),
      delay_codes: dc.codes,
    };
    byKey.set(`${row.flight_no}|${row.ops_date}|${row.dep_airport}`, row); // une ligne en double remplace la précédente
  }
  return { rows: [...byKey.values()], errors, total: table.length - 1 };
}
