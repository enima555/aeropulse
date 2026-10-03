// AeroPulse · Synchronisation des vols depuis un fournisseur de données (AeroDataBox).
// Appelée toutes les 5 minutes par la tâche planifiée (voir supabase/cron.sql).
// Pour chaque ligne active de sync_jobs : départs et arrivées de -2 h à +10 h (heure locale).
// Secret requis : AERODATABOX_KEY (clé RapidAPI). Coût : 1 appel FIDS par aéroport et par passage.
import { adbAirports, adbToFlights, localStamp, type AdbResponse } from "../_shared/aerodatabox.ts";
import { checkCronSecret, json, serviceClient } from "../_shared/http.ts";

const HOST = Deno.env.get("AERODATABOX_HOST") ?? "aerodatabox.p.rapidapi.com";

Deno.serve(async (req) => {
  if (!checkCronSecret(req)) return json(req, { error: "Accès refusé" }, 401);
  const key = Deno.env.get("AERODATABOX_KEY");
  if (!key) return json(req, { error: "Secret AERODATABOX_KEY absent : synchronisation désactivée" }, 503);
  const sb = serviceClient();

  const { data: jobs, error } = await sb.from("sync_jobs").select("id, tenant_id, airport, airports(tz)").eq("enabled", true).eq("provider", "aerodatabox");
  if (error) return json(req, { error: error.message }, 500);

  const report: Record<string, unknown>[] = [];
  for (const job of jobs ?? []) {
    // deno-lint-ignore no-explicit-any
    const tz = (job as any).airports?.tz as string | null;
    if (!tz) { report.push({ airport: job.airport, error: "Fuseau horaire de l'aéroport non renseigné (airports.tz)" }); continue; }
    const now = new Date();
    const from = localStamp(new Date(now.getTime() - 2 * 3600e3), tz);
    const to = localStamp(new Date(now.getTime() + 10 * 3600e3), tz);    // fenêtre de 12 h maximum
    const url = `https://${HOST}/flights/airports/icao/${job.airport}/${from}/${to}?withLeg=true&direction=Both&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false`;
    let status = "ok";
    try {
      const res = await fetch(url, { headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST } });
      if (res.status === 204) { status = "aucun vol"; }
      else if (!res.ok) { status = `erreur fournisseur ${res.status}`; }
      else {
        const body = (await res.json()) as AdbResponse;
        const airports = adbAirports(body);
        if (airports.length) {
          // Ajoute les aéroports inconnus du référentiel ; complète le fuseau s'il manquait.
          await sb.from("airports").upsert(airports.map((a) => ({ ...a, iata: a.iata && /^[A-Z0-9]{3}$/.test(a.iata) ? a.iata : null })), { onConflict: "icao", ignoreDuplicates: true });
          for (const a of airports.filter((x) => x.tz)) await sb.from("airports").update({ tz: a.tz }).eq("icao", a.icao).is("tz", null);
        }
        const { rows, skipped } = adbToFlights(body, job.airport, job.tenant_id);
        const { error: e2 } = await sb.from("flights").upsert(rows, { onConflict: "tenant_id,flight_no,ops_date,dep_airport" });
        status = e2 ? `erreur base : ${e2.message}` : `ok : ${rows.length} vols, ${skipped} ignorés`;
      }
    } catch (e) {
      status = `erreur réseau : ${(e as Error).message}`;
    }
    await sb.from("sync_jobs").update({ last_run_at: new Date().toISOString(), last_status: status }).eq("id", job.id);
    report.push({ airport: job.airport, status });
  }
  return json(req, { ok: true, jobs: report });
});
