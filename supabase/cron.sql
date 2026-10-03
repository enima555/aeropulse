-- AeroPulse · Planification des collectes (à exécuter une fois dans l'éditeur SQL de Supabase).
-- Remplacer <PROJECT_REF> par l'identifiant du projet et <CRON_SECRET> par la valeur du secret
-- défini avec : supabase secrets set CRON_SECRET=...
-- Nécessite les extensions pg_cron et pg_net (Database → Extensions).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Stations météo suivies : l'aéroport du client et ses principales destinations.
insert into public.watched_stations (station) values
  ('LFPO'), ('LFPG'), ('LFMN'), ('LFML'), ('LFBO'), ('LFKJ'), ('LFKB'),
  ('DAAG'), ('DAOO'), ('DTTA'), ('GMMN'), ('GMMX'), ('LPPT'), ('LEMD'), ('LEBL'), ('LIRF'),
  ('TFFR'), ('TFFF'), ('FMEE'), ('SOCA')
on conflict do nothing;

-- Météo : toutes les 10 minutes.
select cron.schedule('aeropulse-metar', '*/10 * * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/ingest-metar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);

-- Vols (fournisseur API) : toutes les 5 minutes, uniquement si des lignes sync_jobs sont actives.
select cron.schedule('aeropulse-flights', '*/5 * * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-flights',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- Vérifier les exécutions : select * from cron.job_run_details order by start_time desc limit 20;
