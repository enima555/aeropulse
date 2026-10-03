// AeroPulse · Adaptateur AeroDataBox (FIDS : départs et arrivées d'un aéroport).
// Transforme la réponse de GET /flights/airports/icao/{icao}/{fromLocal}/{toLocal}?withLeg=true
// en lignes de la table flights. Sans dépendance, testable avec Node et Deno.

import type { FlightRow, FlightStatus } from "./flights_csv.ts";

interface AdbTime { utc?: string; local?: string }
interface AdbAirport {
  icao?: string; iata?: string; name?: string; shortName?: string; municipalityName?: string;
  countryCode?: string; timeZone?: string; location?: { lat?: number; lon?: number };
}
interface AdbMovement {
  airport?: AdbAirport; scheduledTime?: AdbTime; revisedTime?: AdbTime; runwayTime?: AdbTime;
  terminal?: string; gate?: string; quality?: string[];
}
export interface AdbFlight {
  number?: string; status?: string; codeshareStatus?: string; isCargo?: boolean;
  departure?: AdbMovement; arrival?: AdbMovement; movement?: AdbMovement;
  aircraft?: { reg?: string; model?: string };
  airline?: { name?: string; iata?: string; icao?: string };
}
export interface AdbResponse { departures?: AdbFlight[]; arrivals?: AdbFlight[] }

export interface AirportRow {
  icao: string; iata: string | null; name: string; city: string | null; country: string | null;
  lat: number | null; lon: number | null; tz: string | null;
}

const STATUS: Record<string, FlightStatus> = {
  Unknown: "scheduled", Expected: "scheduled", CheckIn: "scheduled", Delayed: "scheduled",
  Boarding: "boarding", GateClosed: "boarding",
  Departed: "departed", EnRoute: "airborne", Approaching: "airborne",
  Arrived: "arrived", Canceled: "cancelled", CanceledUncertain: "cancelled", Diverted: "diverted",
};
const AFTER_DEPARTURE = new Set(["Departed", "EnRoute", "Approaching", "Arrived", "Diverted"]);

/** "2026-10-03 07:40Z" ou "2026-10-03T07:40:00Z" → ISO, sinon null. */
export function adbTime(t?: AdbTime): string | null {
  const s = t?.utc;
  if (!s) return null;
  let v = s.trim().replace(" ", "T");
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(v)) v += "Z";
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function localDate(t?: AdbTime): string | null {
  const m = t?.local?.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function adbAirports(res: AdbResponse): AirportRow[] {
  const map = new Map<string, AirportRow>();
  for (const f of [...(res.departures ?? []), ...(res.arrivals ?? [])]) {
    for (const mv of [f.departure, f.arrival, f.movement]) {
      const a = mv?.airport;
      if (!a?.icao || !/^[A-Z0-9]{4}$/.test(a.icao)) continue;
      const prev = map.get(a.icao);
      const next: AirportRow = {
        icao: a.icao, iata: a.iata ?? null, name: a.name ?? a.icao, city: a.municipalityName ?? a.shortName ?? null,
        country: a.countryCode ?? null, lat: a.location?.lat ?? null, lon: a.location?.lon ?? null, tz: a.timeZone ?? null,
      };
      // Une fiche incomplète ne doit pas écraser une fiche plus riche du même aéroport.
      map.set(a.icao, prev ? {
        icao: a.icao, iata: prev.iata ?? next.iata, name: prev.name !== a.icao ? prev.name : next.name, city: prev.city ?? next.city,
        country: prev.country ?? next.country, lat: prev.lat ?? next.lat, lon: prev.lon ?? next.lon, tz: prev.tz ?? next.tz,
      } : next);
    }
  }
  return [...map.values()];
}

/**
 * Convertit une réponse FIDS (withLeg=true) en vols.
 * `homeIcao` est l'aéroport interrogé ; les vols cargo et les vols en partage de code sont ignorés.
 */
export function adbToFlights(res: AdbResponse, homeIcao: string, tenantId: string): { rows: FlightRow[]; skipped: number } {
  const rows = new Map<string, FlightRow>();
  let skipped = 0;
  const all: [AdbFlight, "D" | "A"][] = [
    ...(res.departures ?? []).map((f) => [f, "D"] as [AdbFlight, "D"]),
    ...(res.arrivals ?? []).map((f) => [f, "A"] as [AdbFlight, "A"]),
  ];
  for (const [f, dir] of all) {
    if (f.isCargo || f.codeshareStatus === "IsCodeshared") { skipped++; continue; }
    // Sans withLeg, seul `movement` est présent (côté aéroport interrogé).
    const home: AdbMovement = (dir === "D" ? f.departure : f.arrival) ?? f.movement ?? {};
    const other: AdbMovement = (dir === "D" ? f.arrival : f.departure) ?? {};
    const dep = dir === "D" ? homeIcao : other.airport?.icao;
    const arr = dir === "A" ? homeIcao : other.airport?.icao;
    const flightNo = (f.number ?? "").toUpperCase().replace(/\s+/g, "");
    if (!dep || !arr || !/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(flightNo)) { skipped++; continue; }

    const depMv = dir === "D" ? home : other;
    const arrMv = dir === "A" ? home : other;
    const std = adbTime(depMv.scheduledTime), sta = adbTime(arrMv.scheduledTime);
    if (!std && !sta) { skipped++; continue; }
    const st = f.status ?? "Unknown";
    const departedYet = AFTER_DEPARTURE.has(st);
    const depRevised = adbTime(depMv.revisedTime), arrRevised = adbTime(arrMv.revisedTime);

    const row: FlightRow = {
      tenant_id: tenantId, source: "api:aerodatabox", flight_no: flightNo,
      ops_date: localDate(depMv.scheduledTime) ?? localDate(arrMv.scheduledTime) ?? (std ?? sta)!.slice(0, 10),
      airline_iata: f.airline?.iata?.toUpperCase() ?? flightNo.slice(0, 2),
      airline_name: f.airline?.name ?? null,
      dep_airport: dep, arr_airport: arr,
      std, sta,
      etd: departedYet ? null : depRevised,
      atd: departedYet ? depRevised : null,
      takeoff: adbTime(depMv.runwayTime),
      eta: st === "Arrived" ? null : arrRevised,
      ata: st === "Arrived" ? arrRevised : null,
      landing: adbTime(arrMv.runwayTime),
      status: STATUS[st] ?? "scheduled",
      aircraft_type: f.aircraft?.model ?? null,
      registration: f.aircraft?.reg ?? null,
      seats: null, pax: null,
      dep_terminal: depMv.terminal ?? null, dep_gate: depMv.gate ?? null, dep_stand: null,
      arr_terminal: arrMv.terminal ?? null, arr_gate: arrMv.gate ?? null, arr_stand: null,
      delay_codes: [],
    };
    rows.set(`${row.flight_no}|${row.ops_date}|${row.dep_airport}`, row);
  }
  return { rows: [...rows.values()], skipped };
}

/** Heure locale « YYYY-MM-DDTHH:mm » d'un instant dans un fuseau IANA (format attendu par l'API). */
export function localStamp(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).reduce((acc, x) => { acc[x.type] = x.value; return acc; }, {} as Record<string, string>);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
