// AeroPulse · Import d'un fichier de vols au format standard (docs/import-format.md).
// POST /functions/v1/import-flights?tenant=<uuid>   corps : le fichier CSV (text/csv)
// L'utilisateur doit être connecté et avoir le rôle « editor » ou « admin » chez ce client :
// la RLS de la base refuse toute écriture sinon.
import { parseFlightsCsv } from "../_shared/flights_csv.ts";
import { cors, json, userClient } from "../_shared/http.ts";

const MAX_BYTES = 5 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Utilisez POST avec le fichier CSV dans le corps" }, 405);

  const tenant = new URL(req.url).searchParams.get("tenant") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(tenant)) return json(req, { error: "Paramètre tenant manquant ou invalide" }, 400);

  const sb = userClient(req);
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return json(req, { error: "Connexion requise" }, 401);
  const { data: allowed } = await sb.rpc("has_role", { p_tenant: tenant, p_min: "editor" });
  if (!allowed) return json(req, { error: "Vous n'avez pas le droit d'importer des vols pour ce client" }, 403);

  const text = await req.text();
  if (text.length > MAX_BYTES) return json(req, { error: "Fichier trop volumineux (5 Mo maximum)" }, 413);

  // Résolution des codes aéroport (OACI ou IATA) à partir du référentiel.
  const codes = new Set<string>();
  for (const m of text.toUpperCase().matchAll(/\b[A-Z0-9]{3,4}\b/g)) codes.add(m[0]);
  const list = [...codes].slice(0, 5000);
  const [byIcao, byIata] = await Promise.all([
    sb.from("airports").select("icao").in("icao", list.filter((c) => c.length === 4)),
    sb.from("airports").select("icao,iata").in("iata", list.filter((c) => c.length === 3)),
  ]);
  const icao = new Set((byIcao.data ?? []).map((a) => a.icao));
  const iata = new Map((byIata.data ?? []).map((a) => [a.iata, a.icao]));
  const resolve = (c: string) => (icao.has(c) ? c : iata.get(c) ?? null);

  const parsed = parseFlightsCsv(text, resolve, tenant, "import");
  let saved = 0;
  const dbErrors: string[] = [];
  for (let i = 0; i < parsed.rows.length; i += 500) {
    const chunk = parsed.rows.slice(i, i + 500);
    const { error, count } = await sb.from("flights").upsert(chunk, { onConflict: "tenant_id,flight_no,ops_date,dep_airport", count: "exact" });
    if (error) dbErrors.push(error.message); else saved += count ?? chunk.length;
  }

  const errors = [...parsed.errors, ...dbErrors.map((m) => ({ line: 0, message: m }))];
  await sb.from("import_runs").insert({
    tenant_id: tenant, user_id: auth.user.id, source: "import",
    rows_ok: saved, rows_rejected: parsed.errors.length, errors: errors.slice(0, 200),
  });
  return json(req, { ok: errors.length === 0, lines: parsed.total, saved, rejected: parsed.errors.length, errors: errors.slice(0, 50) }, dbErrors.length ? 500 : 200);
});
