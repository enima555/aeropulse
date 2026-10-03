// AeroPulse · Décodage METAR (le même que celui de l'application) et lecture de l'API
// aviationweather.gov. Sans dépendance, testable avec Node et Deno.

export interface DecodedMetar {
  wind: { dir: number | null; spd: number; gst: number | null } | null;
  vis: number;              // mètres (9999 = 10 km ou plus)
  wx: string[];             // phénomènes en clair
  clouds: { c: string; h: number; cb?: string }[];
  ceil: number;             // plafond en pieds (99999 = aucun)
  t?: number; td?: number; q?: number;
  cavok?: boolean; ts?: boolean; cb: boolean;
  cat: "VFR" | "MVFR" | "IFR" | "LIFR";
  flags: [string, string][];
}

const WXT: Record<string, string> = { TS: "orage", RA: "pluie", SN: "neige", DZ: "bruine", FG: "brouillard", BR: "brume", DU: "poussière", SA: "sable", HZ: "brume sèche", SH: "averses", GR: "grêle", GS: "grésil", FZ: "givrant", PL: "granules de glace", SQ: "grains", FC: "trombe" };

export function decodeMetar(raw: string): DecodedMetar {
  const o: DecodedMetar = { wind: null, vis: 9999, wx: [], clouds: [], ceil: 99999, cb: false, cat: "VFR", flags: [] };
  const tokens = raw.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const p = tokens[i];
    if (/^(TEMPO|BECMG|NOSIG|RMK)$/.test(p)) break; // tendance ou remarques : on s'arrête à l'observation
    let m: RegExpMatchArray | null;
    if (i < 2 && /^[A-Z]{4}$/.test(p) && p !== "AUTO") continue;            // indicateur de station
    if ((m = p.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/))) {
      const k = m[4] === "MPS" ? 1.944 : 1;
      o.wind = { dir: m[1] === "VRB" ? null : +m[1], spd: Math.round(+m[2] * k), gst: m[3] ? Math.round(+m[3] * k) : null };
    } else if (p === "CAVOK") { o.vis = 10000; o.cavok = true; }
    else if (p === "NSC" || p === "NCD" || p === "SKC" || p === "CLR") { /* pas de nuage significatif */ }
    else if (/^\d{4}$/.test(p)) o.vis = +p;
    else if ((m = p.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/))) {
      const h = +m[2] * 100;
      o.clouds.push({ c: m[1], h, cb: m[3] });
      if (m[3] === "CB") o.cb = true;
      if (m[1] === "BKN" || m[1] === "OVC") o.ceil = Math.min(o.ceil, h);
    } else if ((m = p.match(/^VV(\d{3})$/))) { o.ceil = Math.min(o.ceil, +m[1] * 100); o.clouds.push({ c: "VV", h: +m[1] * 100 }); }
    else if ((m = p.match(/^(M?\d{2})\/(M?\d{2})$/))) { o.t = +m[1].replace("M", "-"); o.td = +m[2].replace("M", "-"); }
    else if ((m = p.match(/^Q(\d{4})$/))) o.q = +m[1];
    else if ((m = p.match(/^A(\d{4})$/))) o.q = Math.round(+m[1] / 100 * 33.8639);
    else if ((m = p.match(/^([-+]?)(VC)?([A-Z]{2,8})$/))) {
      const txt = (m[3].match(/.{2}/g) || []).map((c) => WXT[c] || "").filter(Boolean);
      if (txt.length) {
        o.wx.push((m[1] === "-" ? "faible " : m[1] === "+" ? "forte " : "") + txt.join(" + ") + (m[2] ? " au voisinage" : ""));
        if (/TS/.test(m[3]) && !m[2]) o.ts = true;
      }
    }
  }
  const v = o.vis, c = o.ceil;
  o.cat = v < 1600 || c < 500 ? "LIFR" : v < 5000 || c < 1000 ? "IFR" : v < 8000 || c < 3000 ? "MVFR" : "VFR";
  if (o.ts || o.cb) o.flags.push(["bad", "Orage / cumulonimbus"]);
  if (o.wind && (o.wind.gst || 0) >= 30) o.flags.push(["bad", `Rafales ${o.wind.gst} kt`]);
  else if (o.wind && (o.wind.gst || o.wind.spd) >= 25) o.flags.push(["warn", "Vent fort"]);
  if (v < 1500) o.flags.push(["bad", `Visibilité ${v} m`]); else if (v < 5000) o.flags.push(["warn", "Visibilité réduite"]);
  if (c < 500) o.flags.push(["bad", `Plafond ${c} ft`]); else if (c < 1000) o.flags.push(["warn", "Plafond bas"]);
  return o;
}

export interface MetarRow { station: string; observed_at: string; raw: string; decoded: DecodedMetar }

/** Convertit la réponse JSON de https://aviationweather.gov/api/data/metar en lignes pour metar_obs. */
export function metarRowsFromAwc(json: unknown): MetarRow[] {
  if (!Array.isArray(json)) return [];
  const rows: MetarRow[] = [];
  for (const o of json as Record<string, unknown>[]) {
    const station = String(o.icaoId ?? "").toUpperCase();
    const raw = String(o.rawOb ?? "").trim();
    if (!/^[A-Z0-9]{4}$/.test(station) || !raw) continue;
    let t: number = NaN;
    if (typeof o.obsTime === "number") t = o.obsTime * 1000;
    if (isNaN(t) && typeof o.reportTime === "string") t = Date.parse(o.reportTime.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(o.reportTime) ? "" : "Z"));
    if (isNaN(t)) continue;
    rows.push({ station, observed_at: new Date(t).toISOString(), raw, decoded: decodeMetar(raw) });
  }
  return rows;
}
