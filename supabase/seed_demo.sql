-- AeroPulse · Rattacher un utilisateur à un client (à exécuter dans l'éditeur SQL de Supabase,
-- après avoir créé l'utilisateur dans Authentication → Users → « Add user », case « Auto Confirm » cochée).
-- Rôles : admin (tout), editor (peut importer des vols), viewer (lecture seule).

insert into public.memberships (tenant_id, user_id, role)
select t.id, u.id, 'admin'
from public.tenants t, auth.users u
where t.name = 'Démo Paris-Orly' and u.email = 'vous@exemple.fr'
on conflict (tenant_id, user_id) do update set role = excluded.role;

-- Nouveau client (exemple : une compagnie basée à Alger) :
-- insert into public.tenants (name, kind, home_airport, airline_iata) values ('Ma compagnie', 'airline', 'DAAG', 'XX');

-- Activer la synchronisation des vols réels (AeroDataBox) :
-- select vault.create_secret('<clé RapidAPI>', 'aerodatabox_key', 'Clé AeroDataBox');
