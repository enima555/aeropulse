// AeroPulse · Collecte des METAR réels (aviationweather.gov, gratuit, sans clé).
// Appelée toutes les 10 minutes par la tâche planifiée (voir supabase/cron.sql).
// Limites de la source : 100 requêtes/min au total, appels serveur uniquement.
import { metarRowsFromAwc } from "../_shared/metar.ts";
import { checkCronSecret, json, serviceClient } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (!checkCronSecret(req)) return json(req, { error: "Accès refusé" }, 401);
  const sb = serviceClient();

  const { data: st, error } = await sb.from("watched_stations").select("station");
  if (error) return json(req, { error: error.message }, 500);
  const ids = (st ?? []).map((s) => s.station);
  if (!ids.length) return json(req, { ok: true, inserted: 0, note: "Aucune station suivie (table watched_stations vide)" });

  let inserted = 0;
  const failures: string[] = [];
  for (let i = 0; i < ids.length; i += 40) {           // lots de 40 stations par requête
    const chunk = ids.slice(i, i + 40);
    const url = `https://aviationweather.gov/api/data/metar?ids=${chunk.join(",")}&format=json&hours=2`;
    const res = await fetch(url, { headers: { "User-Agent": "AeroPulse/1.0 (tableau de bord opérations)" } });
    if (res.status === 204) continue;                     // aucune observation récente
    if (!res.ok) { failures.push(`${res.status} pour ${chunk.join(",")}`); continue; }
    const rows = metarRowsFromAwc(await res.json());
    if (!rows.length) continue;
    const { error: e2, count } = await sb.from("metar_obs").upsert(rows, { onConflict: "station,observed_at", ignoreDuplicates: true, count: "exact" });
    if (e2) failures.push(e2.message); else inserted += count ?? 0;
  }
  // Conserver 7 jours d'historique.
  await sb.from("metar_obs").delete().lt("observed_at", new Date(Date.now() - 7 * 86400e3).toISOString());
  return json(req, { ok: failures.length === 0, stations: ids.length, inserted, failures }, failures.length ? 207 : 200);
});
