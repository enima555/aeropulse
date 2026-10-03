-- AeroPulse · Secrets serveur stockés dans Supabase Vault (chiffrés), lisibles uniquement par le serveur.
-- cron_secret : partagé entre les tâches planifiées et les fonctions serveur (généré aléatoirement).
-- project_url : URL du projet, utilisée par les tâches planifiées.
-- aerodatabox_key : clé API du fournisseur de vols, à ajouter avec
--   select vault.create_secret('<clé RapidAPI>', 'aerodatabox_key', 'Clé AeroDataBox');
-- Note : remplacer l'URL ci-dessous par celle du projet lors d'une installation sur un autre projet.

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'Secret des tâches planifiées AeroPulse')
where not exists (select 1 from vault.secrets where name = 'cron_secret');
select vault.create_secret('https://pfkteqdngzmlydueulyj.supabase.co', 'project_url', 'URL du projet pour les tâches planifiées')
where not exists (select 1 from vault.secrets where name = 'project_url');

create or replace function public.get_setting(p_name text) returns text
language sql stable security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1 $$;
revoke execute on function public.get_setting(text) from public, anon, authenticated;
grant execute on function public.get_setting(text) to service_role;

insert into public.watched_stations (station) values
  ('LFPO'), ('LFPG'), ('LFMN'), ('LFML'), ('LFBO'), ('LFKJ'), ('LFKB'),
  ('DAAG'), ('DAOO'), ('DTTA'), ('GMMN'), ('GMMX'), ('LPPT'), ('LEMD'), ('LEBL'), ('LIRF'),
  ('TFFR'), ('TFFF'), ('FMEE'), ('SOCA')
on conflict do nothing;
