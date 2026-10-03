-- AeroPulse · KPI certifiés
-- Une seule définition par indicateur, documentée dans docs/kpi-definitions.md.
-- Les fonctions s'exécutent avec les droits de l'appelant : un utilisateur ne calcule
-- que sur les vols de ses propres clients (RLS).

-- Heure réelle de départ du poste : AOBT, ou à défaut décollage − 10 min (convention documentée).
create or replace function public.actual_off(f public.flights) returns timestamptz
language sql immutable set search_path = '' as $$ select coalesce(f.atd, f.takeoff - interval '10 minutes') $$;

-- Heure réelle d'arrivée au poste : AIBT, ou à défaut atterrissage + 5 min.
create or replace function public.actual_in(f public.flights) returns timestamptz
language sql immutable set search_path = '' as $$ select coalesce(f.ata, f.landing + interval '5 minutes') $$;

create or replace function public.kpi_summary(
  p_tenant  uuid,
  p_airport text,
  p_day     date,
  p_at      timestamptz default now(),
  p_airline text default null
) returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
declare
  v_tz   text;
  v_cf   jsonb;
  d0     timestamptz;
  d1     timestamptz;
  cf_off timestamptz;
  cf_land timestamptz;
  r      jsonb;
begin
  select coalesce(a.tz, 'UTC'), a.curfew into v_tz, v_cf from airports a where a.icao = p_airport;
  if v_tz is null then
    raise exception 'Aéroport inconnu : %', p_airport;
  end if;
  d0 := (p_day::timestamp) at time zone v_tz;
  d1 := ((p_day + 1)::timestamp) at time zone v_tz;
  if v_cf is not null then
    cf_off  := (p_day + (v_cf->>'last_offblock')::time) at time zone v_tz;
    cf_land := (p_day + (v_cf->>'last_landing')::time) at time zone v_tz;
  end if;

  with
  f as (
    select fl.*, actual_off(fl) as aoff, actual_in(fl) as ain
    from flights fl
    where fl.tenant_id = p_tenant
      and (p_airline is null or fl.airline_iata = p_airline)
  ),
  dep as (select * from f where dep_airport = p_airport and std >= d0 and std < d1),
  arr as (select * from f where arr_airport = p_airport and sta >= d0 and sta < d1),
  dep_done as (select * from dep where status <> 'cancelled' and aoff is not null and aoff <= p_at),
  arr_done as (select * from arr where status not in ('cancelled','diverted') and ain is not null and ain <= p_at),
  sched as (
    select status from dep where std <= p_at
    union all
    select status from arr where sta <= p_at
  ),
  done_all as (
    select pax, seats from dep_done union all select pax, seats from arr_done
  ),
  codes as (
    select c->>'code' as code, sum((c->>'min')::numeric) as minutes
    from dep_done, jsonb_array_elements(dep_done.delay_codes) c
    group by 1
  )
  select jsonb_build_object(
    'airport', p_airport,
    'day', p_day,
    'at', p_at,
    'airline', p_airline,
    'dep_scheduled',  (select count(*) from dep where std <= p_at),
    'dep_done',       (select count(*) from dep_done),
    'dep_on_time',    (select count(*) from dep_done where aoff - std <= interval '15 minutes'),
    'otp_dep',        (select round(avg(case when aoff - std <= interval '15 minutes' then 1.0 else 0 end), 4) from dep_done),
    'arr_done',       (select count(*) from arr_done),
    'arr_on_time',    (select count(*) from arr_done where ain - sta <= interval '15 minutes'),
    'otp_arr',        (select round(avg(case when ain - sta <= interval '15 minutes' then 1.0 else 0 end), 4) from arr_done),
    'movements',      (select count(*) from dep_done) + (select count(*) from arr_done),
    'scheduled',      (select count(*) from sched),
    'cancelled',      (select count(*) from sched where status = 'cancelled'),
    'regularity',     (select round(1 - avg(case when status = 'cancelled' then 1.0 else 0 end), 4) from sched),
    'delay_minutes',  (select round(coalesce(sum(greatest(0, extract(epoch from aoff - std) / 60)), 0), 1) from dep_done),
    'avg_delay_per_dep', (select round(avg(greatest(0, extract(epoch from aoff - std) / 60)), 2) from dep_done),
    'taxi_out_avg',   (select round(avg(extract(epoch from takeoff - atd) / 60), 2) from dep_done where takeoff is not null and atd is not null),
    'taxi_in_avg',    (select round(avg(extract(epoch from ata - landing) / 60), 2) from arr_done where ata is not null and landing is not null),
    'pax',            (select sum(pax) from done_all where pax is not null),
    'load_factor',    (select round(sum(pax)::numeric / nullif(sum(seats), 0), 4) from done_all where pax is not null and seats is not null),
    'delay_by_code',  coalesce((select jsonb_object_agg(code, round(minutes, 1)) from codes), '{}'::jsonb),
    'curfew_risk',    case when v_cf is null then null else
                        (select count(*) from dep
                          where status <> 'cancelled' and (aoff is null or aoff > p_at)
                            and p_at > std - interval '120 minutes'
                            and coalesce(atd, etd, std) > cf_off)
                      + (select count(*) from arr
                          where status not in ('cancelled','diverted') and (ain is null or ain > p_at)
                            and coalesce(ata, eta, sta) > cf_land
                            and p_at > coalesce(std, sta - interval '3 hours') - interval '60 minutes')
                      end,
    'data_quality', jsonb_build_object(
        'dep_with_aobt', (select count(*) from dep_done where atd is not null),
        'dep_from_takeoff_only', (select count(*) from dep_done where atd is null),
        'last_update', (select max(updated_at) from f where (dep_airport = p_airport and std >= d0 and std < d1) or (arr_airport = p_airport and sta >= d0 and sta < d1))
    )
  ) into r;
  return r;
end
$$;

-- Benchmark : mêmes KPI, une ligne par compagnie présente sur l'aéroport ce jour-là.
create or replace function public.kpi_by_airline(
  p_tenant  uuid,
  p_airport text,
  p_day     date,
  p_at      timestamptz default now()
) returns table (airline_iata text, airline_name text, kpi jsonb)
language plpgsql stable security invoker set search_path = public
as $$
declare
  v_tz text; d0 timestamptz; d1 timestamptz;
begin
  select coalesce(a.tz, 'UTC') into v_tz from airports a where a.icao = p_airport;
  d0 := (p_day::timestamp) at time zone v_tz;
  d1 := ((p_day + 1)::timestamp) at time zone v_tz;
  return query
    select x.airline_iata, max(x.airline_name), public.kpi_summary(p_tenant, p_airport, p_day, p_at, x.airline_iata)
    from flights x
    where x.tenant_id = p_tenant and x.airline_iata is not null
      and ((x.dep_airport = p_airport and x.std >= d0 and x.std < d1)
        or (x.arr_airport = p_airport and x.sta >= d0 and x.sta < d1))
    group by x.airline_iata
    order by x.airline_iata;
end
$$;

revoke execute on function public.kpi_summary(uuid, text, date, timestamptz, text) from public, anon;
revoke execute on function public.kpi_by_airline(uuid, text, date, timestamptz) from public, anon;
grant execute on function public.kpi_summary(uuid, text, date, timestamptz, text) to authenticated;
grant execute on function public.kpi_by_airline(uuid, text, date, timestamptz) to authenticated;
