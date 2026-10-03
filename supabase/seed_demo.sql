-- AeroPulse · Premier client et premier administrateur (à exécuter dans l'éditeur SQL de Supabase,
-- après avoir créé l'utilisateur dans Authentication → Users → « Add user »).

-- 1. Créer le client de démonstration sur Paris-Orly.
insert into public.tenants (name, kind, home_airport)
values ('Démo Paris-Orly', 'demo', 'LFPO')
returning id;   -- noter cet identifiant

-- 2. Rattacher l'utilisateur comme administrateur (remplacer l'e-mail).
insert into public.memberships (tenant_id, user_id, role)
select t.id, u.id, 'admin'
from public.tenants t, auth.users u
where t.name = 'Démo Paris-Orly' and u.email = 'vous@exemple.fr';

-- 3. (Optionnel) Synchroniser les vols réels d'Orly via AeroDataBox toutes les 5 minutes.
insert into public.sync_jobs (tenant_id, airport, provider)
select id, 'LFPO', 'aerodatabox' from public.tenants where name = 'Démo Paris-Orly';
