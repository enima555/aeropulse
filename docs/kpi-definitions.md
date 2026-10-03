# Définitions des KPI AeroPulse (version 1)

Chaque indicateur a une seule définition. Le serveur l'applique dans `public.kpi_summary` (SQL) et l'application dans `web/kpi.js`. Le test `tests/db.test.mjs` vérifie que les deux donnent les mêmes valeurs.

## Conventions

| Terme | Définition |
|---|---|
| Journée | Jour local de l'aéroport suivi (fuseau `airports.tz`), de 00:00 à 24:00. |
| Départ du jour | Vol qui part de l'aéroport suivi avec un départ prévu (`std`) dans la journée. |
| Arrivée du jour | Vol qui arrive à l'aéroport suivi avec une arrivée prévue (`sta`) dans la journée. |
| Départ réel | Heure de départ du poste (`atd`, AOBT). Si la source ne fournit que le décollage, on prend décollage − 10 min. |
| Arrivée réelle | Heure d'arrivée au poste (`ata`, AIBT). Si la source ne fournit que l'atterrissage, on prend atterrissage + 5 min. |
| Vol parti | Départ du jour non annulé dont le départ réel est passé. |
| Vol arrivé | Arrivée du jour ni annulée ni déroutée dont l'arrivée réelle est passée. |
| À l'heure | Écart de 15 minutes ou moins avec l'heure prévue (norme du secteur). |

Les heures sont stockées en UTC et affichées dans le fuseau de l'aéroport.

## Indicateurs

| Clé | Nom | Calcul |
|---|---|---|
| `otp_dep` | Ponctualité départ | Vols partis à l'heure ÷ vols partis |
| `otp_arr` | Ponctualité arrivée | Vols arrivés à l'heure ÷ vols arrivés |
| `regularity` | Régularité | 1 − annulés ÷ vols programmés jusqu'à l'instant (départs et arrivées) |
| `movements` | Mouvements | Vols partis + vols arrivés |
| `delay_minutes` | Minutes de retard | Somme des retards au départ des vols partis, retards négatifs comptés 0 |
| `avg_delay_per_dep` | Retard moyen par départ | Minutes de retard ÷ vols partis |
| `taxi_out_avg` | Roulage sortie | Moyenne de (décollage − départ du poste), vols ayant les deux heures |
| `taxi_in_avg` | Roulage entrée | Moyenne de (arrivée au poste − atterrissage), vols ayant les deux heures |
| `pax` | Passagers traités | Somme des passagers des vols partis et arrivés (si transmis) |
| `load_factor` | Remplissage | Passagers ÷ sièges, sur les vols où les deux sont connus |
| `delay_by_code` | Retards par motif | Minutes déclarées par code IATA sur les vols partis |
| `curfew_risk` | Risque couvre-feu | Vols pas encore partis (ou arrivés) dont l'heure estimée dépasse la limite de l'aéroport (`airports.curfew`). Un départ est compté dans les 2 h qui précèdent son heure prévue ; une arrivée, à partir d'1 h avant son départ de l'escale. |

`data_quality` indique combien de départs ont une vraie heure AOBT et combien sont déduits du décollage. Un taux élevé de valeurs déduites signale une source incomplète.

## Évolution

Toute modification d'une définition doit changer en même temps la fonction SQL, `web/kpi.js`, ce document et le test de parité, et augmenter la version de ce document.
