# Format d'import des vols (CSV)

Ce format est celui que vos clients utilisent pour envoyer leurs vols, depuis l'application (bouton « Importer un fichier CSV » de l'écran Vols) ou par l'API.

Un modèle rempli se trouve dans `samples/flights_template.csv`.

## Règles générales

- Encodage UTF-8. Séparateur `;`, `,` ou tabulation, détecté automatiquement.
- Une ligne d'en-tête. Les noms de colonnes acceptent les variantes françaises indiquées ci-dessous, sans tenir compte des accents ni des majuscules.
- Les heures sont au format ISO 8601 **avec fuseau** : `2026-10-03T07:40+02:00` ou `2026-10-03T05:40Z`. Une heure sans fuseau est refusée, car elle serait ambiguë.
- Les aéroports peuvent être donnés en code OACI (`LFPO`) ou IATA (`ORY`).
- Un vol est identifié par son numéro, sa date de départ et son aéroport de départ. Réimporter le même vol met à jour la ligne existante.
- Taille maximale : 5 Mo par fichier.
- Les lignes invalides sont refusées une par une, avec le numéro de ligne et la raison. Les lignes valides sont enregistrées.

## Colonnes

| Colonne | Variantes acceptées | Obligatoire | Exemple |
|---|---|---|---|
| `flight_no` | vol, numero_vol | oui | `SX312` |
| `dep` | origine, depart, from | oui | `ORY` |
| `arr` | destination, arrivee, to | oui | `LIS` |
| `std` | depart_prevu, sobt | `std` ou `sta` | `2026-10-03T07:40+02:00` |
| `sta` | arrivee_prevue, sibt | `std` ou `sta` | `2026-10-03T09:10+01:00` |
| `etd` / `eta` | depart_estime / arrivee_estimee | non | |
| `atd` | aobt, depart_reel | non | départ réel du poste |
| `takeoff` | atot, decollage | non | |
| `landing` | aldt, atterrissage | non | |
| `ata` | aibt, arrivee_reelle | non | arrivée réelle au poste |
| `status` | statut | non | `scheduled`, `boarding`, `departed`, `airborne`, `landed`, `arrived`, `cancelled`, `diverted` (ou `annulé`, `dérouté`…). Déduit des heures réelles s'il est absent. |
| `airline_iata` / `airline_name` | cie / compagnie | non | `SX` / `Seine Air` |
| `aircraft_type` | type_avion | non | `A320` |
| `registration` | immat | non | `F-HSXA` |
| `seats` / `pax` | sieges / passagers | non | `189` / `171` |
| `dep_terminal`, `dep_gate`, `dep_stand` | terminal, porte, poste | non | |
| `arr_terminal`, `arr_gate`, `arr_stand` | | non | |
| `delay_codes` | codes_retard, motifs | non | `93:12` ou `93:12\|41:8` (code IATA : minutes) |

## Par l'API

```
POST https://<projet>.supabase.co/functions/v1/import-flights?tenant=<identifiant du client>
Authorization: Bearer <jeton de l'utilisateur>
apikey: <clé anon>
Content-Type: text/csv

<contenu du fichier>
```

Réponse : `{ "ok": true, "lines": 120, "saved": 118, "rejected": 2, "errors": [{ "line": 14, "message": "…" }] }`.
L'utilisateur doit avoir le rôle éditeur ou administrateur chez ce client.
