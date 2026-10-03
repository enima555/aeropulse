-- Fuseaux horaires des aéroports suivis (les autres sont complétés par la synchronisation API).
update public.airports a set tz = v.tz from (values
 ('LFPO','Europe/Paris'),('LFPG','Europe/Paris'),('LFML','Europe/Paris'),('LFMN','Europe/Paris'),('LFLL','Europe/Paris'),('LFBO','Europe/Paris'),
 ('LFBD','Europe/Paris'),('LFRS','Europe/Paris'),('LFKJ','Europe/Paris'),('LFKB','Europe/Paris'),('LFMT','Europe/Paris'),('LFBZ','Europe/Paris'),
 ('LFRB','Europe/Paris'),('LFMP','Europe/Paris'),
 ('DAAG','Africa/Algiers'),('DAOO','Africa/Algiers'),('DABC','Africa/Algiers'),('DAUH','Africa/Algiers'),('DAAT','Africa/Algiers'),
 ('DTTA','Africa/Tunis'),('DTTJ','Africa/Tunis'),('GMMN','Africa/Casablanca'),('GMMX','Africa/Casablanca'),
 ('LPPT','Europe/Lisbon'),('LPPR','Europe/Lisbon'),('LPFR','Europe/Lisbon'),('LEMD','Europe/Madrid'),('LEBL','Europe/Madrid'),('LEMG','Europe/Madrid'),
 ('LIRF','Europe/Rome'),('EGLL','Europe/London'),('EHAM','Europe/Amsterdam'),('EDDF','Europe/Berlin'),('EBBR','Europe/Brussels'),('LTFM','Europe/Istanbul'),
 ('OMDB','Asia/Dubai'),('OEJN','Asia/Riyadh'),('HECA','Africa/Cairo'),('GOBD','Africa/Dakar'),('DRRN','Africa/Niamey'),
 ('TFFR','America/Guadeloupe'),('TFFF','America/Martinique'),('FMEE','Indian/Reunion'),('SOCA','America/Cayenne'),
 ('KEWR','America/New_York'),('KJFK','America/New_York')
) as v(icao, tz) where a.icao = v.icao;

-- Couvre-feu de Paris-Orly : départ du poste au plus tard 23:15, aucun mouvement de 23:30 à 06:00
-- (arrêté ministériel publié le 11 juillet 2025).
update public.airports set curfew = '{"last_offblock":"23:15","last_landing":"23:30","reopen":"06:00"}'::jsonb where icao = 'LFPO';
