-- AeroPulse · Nettoyage horaire des comptes invités expirés (fonction serveur guest-access).
select cron.schedule('aeropulse-guest-cleanup', '17 * * * *', $$ select public.call_function('guest-access', 30000); $$);
