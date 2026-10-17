-- AeroPulse · Accès invités temporaires (bouton « Partager »).
-- Un administrateur crée un identifiant + mot de passe pour un prospect, en lecture seule.
-- L'accès s'ouvre à la première connexion et expire 2 heures plus tard (durée réglable par invitation).
-- Un identifiant jamais utilisé devient inutilisable après la date limite de première connexion.

alter table public.memberships
  add column if not exists is_guest        boolean not null default false,
  add column if not exists guest_username  text,
  add column if not exists label           text,                 -- nom du prospect, pour l'administrateur
  add column if not exists created_by      uuid,
  add column if not exists activate_before timestamptz,          -- date limite de première connexion
  add column if not exists access_duration interval,             -- durée de l'accès après la première connexion
  add column if not exists first_login_at  timestamptz,
  add column if not exists expires_at      timestamptz;          -- fixée à la première connexion

alter table public.memberships drop constraint if exists memberships_guest_viewer;
alter table public.memberships add constraint memberships_guest_viewer
  check (not is_guest or (role = 'viewer' and activate_before is not null and access_duration is not null));
create unique index if not exists memberships_guest_username_idx on public.memberships (guest_username) where guest_username is not null;
create index if not exists memberships_guest_exp_idx on public.memberships (expires_at) where is_guest;

-- Les droits ne valent que pour un rôle non expiré ; un invité n'a aucun droit tant qu'il n'a pas activé son accès.
create or replace function public.has_role(p_tenant uuid, p_min text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant
      and m.user_id = (select auth.uid())
      and (not m.is_guest or (m.expires_at is not null and m.expires_at > now()))
      and (m.expires_at is null or m.expires_at > now())
      and (case m.role when 'admin' then 3 when 'editor' then 2 else 1 end)
          >= (case p_min when 'admin' then 3 when 'editor' then 2 else 1 end)
  );
$$;

-- Appelée par l'application juste après la connexion d'un invité :
-- la première fois, démarre le compte à rebours. Renvoie l'heure d'expiration (null si pas invité ou accès épuisé).
create or replace function public.activate_guest()
returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare v timestamptz;
begin
  update public.memberships
     set first_login_at = now(), expires_at = now() + access_duration
   where user_id = (select auth.uid()) and is_guest and first_login_at is null and activate_before > now();
  select max(expires_at) into v from public.memberships
   where user_id = (select auth.uid()) and is_guest and expires_at > now();
  return v;
end $$;
revoke execute on function public.activate_guest() from public, anon;
grant execute on function public.activate_guest() to authenticated;

-- Un invité ne doit pas pouvoir modifier sa propre ligne (les politiques d'écriture exigent déjà le rôle admin).
-- Les champs d'invitation ne sont lisibles que par les admins du client et par l'invité lui-même (politique member_read).
