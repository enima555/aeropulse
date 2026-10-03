-- AeroPulse · Planification (pg_cron) et appels HTTP (pg_net).
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Appel d'une fonction serveur AeroPulse avec le secret des tâches planifiées (lu dans Vault).
create or replace function public.call_function(p_name text, p_timeout_ms int default 60000) returns bigint
language sql security definer set search_path = ''
as $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := p_timeout_ms
  );
$$;
revoke execute on function public.call_function(text, int) from public, anon, authenticated;

-- Premier chargement du référentiel des aéroports (≈ 4 000 aéroports, source OurAirports) :
--   select public.call_function('seed-airports', 120000);
