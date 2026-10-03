-- AeroPulse · Clients (multi-tenant), rôles, vols, météo, imports
-- Chaque client (compagnie, aéroport ou démo) ne voit que ses propres vols.

-- ---------- Clients et rôles ----------
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          text not null check (kind in ('airline','airport','demo')),
  home_airport  text references public.airports(icao),
  airline_iata  text,
  created_at    timestamptz not null default now()
);

create table if not exists public.memberships (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin','editor','viewer')),
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships (user_id);

-- Vrai si l'utilisateur connecté a au moins le rôle demandé chez ce client.
-- Appelable par les utilisateurs connectés (utilisé par la RLS et la fonction d'import) :
-- elle ne révèle que les droits de l'utilisateur lui-même.
create or replace function public.has_role(p_tenant uuid, p_min text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant
      and m.user_id = (select auth.uid())
      and (case m.role when 'admin' then 3 when 'editor' then 2 else 1 end)
          >= (case p_min when 'admin' then 3 when 'editor' then 2 else 1 end)
  );
$$;

-- ---------- Vols ----------
create table if not exists public.flights (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  source        text not null default 'import',      -- import | api:aerodatabox | ...
  external_id   text,
  airline_iata  text,
  airline_name  text,
  flight_no     text not null,
  ops_date      date not null,                       -- date locale du départ prévu
  dep_airport   text not null references public.airports(icao),
  arr_airport   text not null references public.airports(icao),
  std           timestamptz,                         -- départ prévu (poste)
  sta           timestamptz,                         -- arrivée prévue (poste)
  etd           timestamptz,                         -- départ estimé
  eta           timestamptz,                         -- arrivée estimée
  atd           timestamptz,                         -- départ réel du poste (AOBT)
  takeoff       timestamptz,                         -- décollage réel
  landing       timestamptz,                         -- atterrissage réel
  ata           timestamptz,                         -- arrivée réelle au poste (AIBT)
  status        text not null default 'scheduled'
                check (status in ('scheduled','boarding','departed','airborne','landed','arrived','cancelled','diverted')),
  aircraft_type text,
  registration  text,
  seats         int check (seats is null or seats >= 0),
  pax           int check (pax is null or pax >= 0),
  dep_terminal  text, dep_gate text, dep_stand text,
  arr_terminal  text, arr_gate text, arr_stand text,
  delay_codes   jsonb not null default '[]'::jsonb,  -- [{"code":"93","min":25}]
  updated_at    timestamptz not null default now(),
  constraint flights_times_present check (std is not null or sta is not null),
  constraint flights_unique_leg unique (tenant_id, flight_no, ops_date, dep_airport)
);
create index if not exists flights_dep_idx on public.flights (tenant_id, dep_airport, std);
create index if not exists flights_arr_idx on public.flights (tenant_id, arr_airport, sta);
create index if not exists flights_updated_idx on public.flights (tenant_id, updated_at);
create index if not exists flights_dep_fk_idx on public.flights (dep_airport);
create index if not exists flights_arr_fk_idx on public.flights (arr_airport);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end $$;
create trigger flights_touch before update on public.flights
  for each row execute function public.touch_updated_at();

-- ---------- Météo (partagée) ----------
create table if not exists public.metar_obs (
  station      text not null,
  observed_at  timestamptz not null,
  raw          text not null,
  decoded      jsonb,
  fetched_at   timestamptz not null default now(),
  primary key (station, observed_at)
);
create table if not exists public.watched_stations (
  station text primary key check (station ~ '^[A-Z0-9]{4}$')
);
create or replace view public.metar_latest with (security_invoker = true) as
  select distinct on (station) station, observed_at, raw, decoded
  from public.metar_obs order by station, observed_at desc;

-- ---------- Synchronisation API et journal d'import ----------
create table if not exists public.sync_jobs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  airport     text not null references public.airports(icao),
  provider    text not null default 'aerodatabox',
  enabled     boolean not null default true,
  last_run_at timestamptz,
  last_status text
);
create index if not exists sync_jobs_tenant_idx on public.sync_jobs (tenant_id);
create index if not exists sync_jobs_airport_idx on public.sync_jobs (airport);
create table if not exists public.import_runs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  user_id        uuid,
  source         text not null,
  rows_ok        int not null default 0,
  rows_rejected  int not null default 0,
  errors         jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists import_runs_tenant_idx on public.import_runs (tenant_id);
create index if not exists tenants_home_idx on public.tenants (home_airport);

-- ---------- Sécurité : règles d'accès (RLS) ----------
alter table public.airports        enable row level security;
alter table public.delay_codes     enable row level security;
alter table public.aircraft_types  enable row level security;
alter table public.tenants         enable row level security;
alter table public.memberships     enable row level security;
alter table public.flights         enable row level security;
alter table public.metar_obs       enable row level security;
alter table public.watched_stations enable row level security;
alter table public.sync_jobs       enable row level security;
alter table public.import_runs     enable row level security;

-- Référentiel et météo : lecture pour tout utilisateur connecté, écriture réservée au serveur.
create policy ref_read_airports  on public.airports        for select to authenticated using (true);
create policy ref_read_delay     on public.delay_codes     for select to authenticated using (true);
create policy ref_read_types     on public.aircraft_types  for select to authenticated using (true);
create policy wx_read            on public.metar_obs       for select to authenticated using (true);
create policy wx_read_stations   on public.watched_stations for select to authenticated using (true);

-- Clients : visibles par leurs membres, modifiables par leurs admins.
create policy tenant_read   on public.tenants for select to authenticated using ((select public.has_role(id, 'viewer')));
create policy tenant_update on public.tenants for update to authenticated using ((select public.has_role(id, 'admin'))) with check ((select public.has_role(id, 'admin')));

-- Rôles : chacun voit les siens ; les admins gèrent ceux de leur client.
create policy member_read   on public.memberships for select to authenticated using (user_id = (select auth.uid()) or (select public.has_role(tenant_id, 'admin')));
create policy member_insert on public.memberships for insert to authenticated with check ((select public.has_role(tenant_id, 'admin')));
create policy member_update on public.memberships for update to authenticated using ((select public.has_role(tenant_id, 'admin'))) with check ((select public.has_role(tenant_id, 'admin')));
create policy member_delete on public.memberships for delete to authenticated using ((select public.has_role(tenant_id, 'admin')));

-- Vols : lecture pour les membres, écriture pour éditeurs et admins.
create policy flights_read   on public.flights for select to authenticated using ((select public.has_role(tenant_id, 'viewer')));
create policy flights_insert on public.flights for insert to authenticated with check ((select public.has_role(tenant_id, 'editor')));
create policy flights_update on public.flights for update to authenticated using ((select public.has_role(tenant_id, 'editor'))) with check ((select public.has_role(tenant_id, 'editor')));
create policy flights_delete on public.flights for delete to authenticated using ((select public.has_role(tenant_id, 'admin')));

create policy sync_read     on public.sync_jobs   for select to authenticated using ((select public.has_role(tenant_id, 'admin')));
create policy imports_read  on public.import_runs for select to authenticated using ((select public.has_role(tenant_id, 'viewer')));
create policy imports_write on public.import_runs for insert to authenticated with check ((select public.has_role(tenant_id, 'editor')));

revoke all on all tables in schema public from anon;
revoke all on public.airports, public.delay_codes, public.aircraft_types, public.metar_obs, public.watched_stations, public.metar_latest,
              public.tenants, public.memberships, public.flights, public.sync_jobs, public.import_runs from authenticated;
grant select on public.airports, public.delay_codes, public.aircraft_types, public.metar_obs, public.watched_stations, public.metar_latest to authenticated;
grant select, update on public.tenants to authenticated;
grant select, insert, update, delete on public.memberships, public.flights to authenticated;
grant select on public.sync_jobs to authenticated;
grant select, insert on public.import_runs to authenticated;
revoke execute on function public.has_role(uuid, text) from public, anon;
grant execute on function public.has_role(uuid, text) to authenticated;
