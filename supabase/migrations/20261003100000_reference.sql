-- AeroPulse · Référentiel partagé entre tous les clients
-- Aéroports, codes de retard IATA, types d'avion.

create table if not exists public.airports (
  icao        text primary key check (icao ~ '^[A-Z0-9]{4}$'),
  iata        text check (iata is null or iata ~ '^[A-Z0-9]{3}$'),
  name        text not null,
  city        text,
  country     text,            -- code ISO 3166-1 alpha-2
  continent   text,            -- AF, AN, AS, EU, NA, OC, SA
  lat         double precision,
  lon         double precision,
  tz          text,            -- fuseau IANA, ex. Europe/Paris (obligatoire pour un aéroport suivi)
  curfew      jsonb            -- ex. {"last_offblock":"23:15","last_landing":"23:30","reopen":"06:00"}
);
create index if not exists airports_iata_idx on public.airports (iata);

create table if not exists public.delay_codes (
  code      text primary key,  -- code IATA AHM 730, ex. '93'
  label     text not null,
  category  text not null
);

create table if not exists public.aircraft_types (
  code           text primary key,  -- code OACI, ex. 'A320'
  name           text not null,
  seats_default  int,
  wide           boolean not null default false,
  co2_g_pkm      numeric             -- estimation g CO2 par passager-km
);

insert into public.delay_codes (code, label, category) values
  ('11','Enregistrement tardif','Passagers et bagages'),
  ('12','Enregistrement tardif, congestion','Passagers et bagages'),
  ('14','Surréservation','Passagers et bagages'),
  ('15','Embarquement','Passagers et bagages'),
  ('17','Commandes catering','Passagers et bagages'),
  ('18','Traitement des bagages','Passagers et bagages'),
  ('21','Documentation fret','Fret et poste'),
  ('31','Documentation avion tardive','Assistance avion et rampe'),
  ('32','Chargement / déchargement','Assistance avion et rampe'),
  ('33','Équipement de chargement','Assistance avion et rampe'),
  ('34','Équipement de service','Assistance avion et rampe'),
  ('35','Nettoyage avion','Assistance avion et rampe'),
  ('36','Avitaillement carburant','Assistance avion et rampe'),
  ('37','Catering','Assistance avion et rampe'),
  ('41','Défaut technique avion','Technique'),
  ('42','Maintenance programmée','Technique'),
  ('46','Changement d''avion (technique)','Technique'),
  ('51','Dommage avion en vol','Dommages et pannes'),
  ('52','Dommage avion au sol','Dommages et pannes'),
  ('61','Plan de vol, préparation','Opérations et équipage'),
  ('62','Exigences opérationnelles','Opérations et équipage'),
  ('63','Équipage technique tardif','Opérations et équipage'),
  ('64','Équipage technique manquant','Opérations et équipage'),
  ('65','Demande spéciale équipage technique','Opérations et équipage'),
  ('66','Équipage commercial tardif','Opérations et équipage'),
  ('67','Équipage commercial manquant','Opérations et équipage'),
  ('71','Météo au départ','Météo'),
  ('72','Météo à destination','Météo'),
  ('73','Météo en route ou dégagement','Météo'),
  ('75','Dégivrage','Météo'),
  ('76','Déneigement aéroport','Météo'),
  ('81','ATFM en route (capacité)','Contrôle aérien et aéroport'),
  ('82','ATFM effectif / staffing','Contrôle aérien et aéroport'),
  ('83','ATFM à destination','Contrôle aérien et aéroport'),
  ('84','ATFM météo à destination','Contrôle aérien et aéroport'),
  ('85','Sûreté obligatoire','Contrôle aérien et aéroport'),
  ('86','Immigration, douane, santé','Contrôle aérien et aéroport'),
  ('87','Installations aéroportuaires','Contrôle aérien et aéroport'),
  ('88','Restrictions à destination','Contrôle aérien et aéroport'),
  ('89','Restrictions aéroport de départ','Contrôle aérien et aéroport'),
  ('91','Correspondance passagers','Rotation'),
  ('92','Correspondance passagers (via)','Rotation'),
  ('93','Avion arrivé en retard (rotation)','Rotation'),
  ('94','Rotation équipage cabine','Rotation'),
  ('95','Rotation équipage','Rotation'),
  ('96','Opérations (réaffectation)','Rotation'),
  ('99','Autre','Divers')
on conflict (code) do update set label = excluded.label, category = excluded.category;

insert into public.aircraft_types (code, name, seats_default, wide, co2_g_pkm) values
  ('AT76','ATR 72-600',70,false,85),
  ('DH8D','Dash 8-400',78,false,88),
  ('CRJ9','CRJ900',90,false,95),
  ('E190','Embraer 190',100,false,92),
  ('E195','Embraer 195',120,false,88),
  ('BCS3','Airbus A220-300',148,false,70),
  ('A319','Airbus A319',144,false,86),
  ('A320','Airbus A320',180,false,82),
  ('A20N','Airbus A320neo',186,false,72),
  ('A321','Airbus A321',220,false,78),
  ('A21N','Airbus A321neo',220,false,68),
  ('B737','Boeing 737-700',149,false,86),
  ('B738','Boeing 737-800',189,false,80),
  ('B38M','Boeing 737 MAX 8',189,false,70),
  ('A332','Airbus A330-200',340,true,79),
  ('A333','Airbus A330-300',380,true,77),
  ('A339','Airbus A330-900',390,true,70),
  ('A359','Airbus A350-900',411,true,66),
  ('A35K','Airbus A350-1000',440,true,65),
  ('B772','Boeing 777-200',350,true,82),
  ('B77W','Boeing 777-300ER',400,true,78),
  ('B788','Boeing 787-8',290,true,70),
  ('B789','Boeing 787-9',300,true,68)
on conflict (code) do nothing;
