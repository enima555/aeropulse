-- Collectes planifiées (le secret et l'URL sont lus dans Vault par public.call_function).
select cron.schedule('aeropulse-metar',   '*/10 * * * *', $$ select public.call_function('ingest-metar', 30000); $$);
select cron.schedule('aeropulse-flights', '*/5 * * * *',  $$ select public.call_function('sync-flights', 60000); $$);

-- Client de démonstration sur Paris-Orly, synchronisé dès que la clé AeroDataBox est ajoutée.
insert into public.tenants (name, kind, home_airport)
select 'Démo Paris-Orly', 'demo', 'LFPO'
where not exists (select 1 from public.tenants where name = 'Démo Paris-Orly');
insert into public.sync_jobs (tenant_id, airport, provider)
select id, 'LFPO', 'aerodatabox' from public.tenants t
where name = 'Démo Paris-Orly' and not exists (select 1 from public.sync_jobs s where s.tenant_id = t.id and s.airport = 'LFPO');
