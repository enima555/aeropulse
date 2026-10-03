# AeroPulse

Tableau de bord opérationnel et benchmark de ponctualité pour compagnies aériennes et aéroports. Il fonctionne sur le web, la tablette et le mobile.

L'application a deux modes :
- **Démonstration** : données fictives, sans connexion. C'est le mode par défaut tant que `web/config.js` est vide.
- **Données réelles** : connexion utilisateur, vols et météo lus dans la base Supabase, KPI certifiés.

## Architecture

```
Sources                          Serveur (Supabase)                             Application (Netlify)
─────────────────────────        ────────────────────────────────────────       ─────────────────────
Fichiers CSV des clients  ─────► import-flights  ─┐
API AeroDataBox (vols)    ─────► sync-flights   ─┼─► PostgreSQL ──► KPI (SQL) ──► web/ (index.html, app.js, kpi.js)
aviationweather.gov       ─────► ingest-metar   ─┘   + règles d'accès par client
                                 (planifiées toutes les 5–10 min)
```

- **Multi-client** : chaque compagnie, aéroport ou démo est un client (`tenants`). Les règles d'accès de la base (RLS) garantissent qu'un utilisateur ne voit que les vols de ses clients. Il existe trois rôles : `admin`, `editor` (peut importer), `viewer`.
- **KPI certifiés** : une définition unique par indicateur, décrite dans [docs/kpi-definitions.md](docs/kpi-definitions.md). Elle est appliquée à l'identique par le serveur et par l'application, et un test vérifie la parité.
- **Référentiel** : 3 989 aéroports à vols réguliers (OurAirports, domaine public), les codes de retard IATA, les types d'avion et le couvre-feu d'Orly.

## Arborescence

| Dossier | Contenu |
|---|---|
| `web/` | L'application. `config.js` contient l'URL et la clé publique Supabase. |
| `supabase/migrations/` | Schéma, référentiel, sécurité, fonctions KPI. |
| `supabase/functions/` | Fonctions serveur : import CSV, synchronisation des vols, météo. |
| `supabase/seed_demo.sql` | Rattacher un utilisateur à un client, activer la synchro des vols. |
| `docs/` | Définitions des KPI, format d'import. |
| `samples/` | Modèle CSV et jeu de démonstration (128 vols). |
| `tests/` | Tests unitaires, base de données (parité, sécurité), navigateur. |

## Installation actuelle

| Élément | Valeur |
|---|---|
| Projet Supabase | `aeropulse` (`pfkteqdngzmlydueulyj`), région Paris (eu-west-3), offre gratuite |
| URL de l'API | https://pfkteqdngzmlydueulyj.supabase.co |
| Fonctions serveur | `ingest-metar`, `sync-flights`, `import-flights`, `seed-airports` |
| Collectes planifiées | météo toutes les 10 min (`aeropulse-metar`), vols toutes les 5 min (`aeropulse-flights`) |
| Secrets | dans Supabase Vault : `cron_secret` (généré), `project_url`, `aerodatabox_key` (à ajouter) |
| Site Netlify | `aeropulse-app` → https://aeropulse-app.netlify.app |
| Client de démonstration | « Démo Paris-Orly » (LFPO), synchronisé dès que la clé AeroDataBox est ajoutée |

Les secrets ne passent jamais par des variables d'environnement à recopier : les tâches planifiées et les fonctions serveur les lisent dans Vault (fonctions SQL `call_function` et `get_setting`, réservées au serveur).

## Installer sur un nouveau projet Supabase

1. Créer le projet, puis appliquer les migrations : `supabase link --project-ref <id>` puis `supabase db push`. Dans `*_settings_vault.sql`, remplacez d'abord l'URL du projet.
2. Déployer les fonctions : `supabase functions deploy ingest-metar sync-flights import-flights seed-airports`.
3. Charger le référentiel des aéroports, dans l'éditeur SQL : `select public.call_function('seed-airports', 120000);`.
4. Créer un utilisateur (Authentication → Users → Add user), puis le rattacher à un client avec `supabase/seed_demo.sql`.
5. Renseigner `web/config.js` (URL et clé publishable), puis déployer le dossier `web/` sur Netlify.
6. Dans Authentication → URL Configuration, mettre l'adresse du site comme Site URL (pour les liens de connexion par e-mail).

## Données de vol

- **Vos clients** importent leurs vols au format CSV ([docs/import-format.md](docs/import-format.md)). C'est la source principale pour une compagnie : export de son système d'opérations (AIMS, Netline, Sabre…).
- **Démo et benchmark** : la fonction `sync-flights` interroge AeroDataBox (départs et arrivées d'un aéroport) pour chaque ligne active de `sync_jobs`. AeroDataBox ne fournit ni passagers ni codes de retard. Les KPI correspondants restent vides pour ces vols. Avant toute revente des données, vérifiez les conditions d'utilisation commerciale du fournisseur.
- **Météo** : METAR officiels d'aviationweather.gov, gratuits et sans clé. Les stations suivies sont dans `watched_stations`.

## Tests

```
./tests/run_all.sh
```

Le script crée une base PostgreSQL jetable, applique les migrations et lance :
- les tests unitaires (import CSV, METAR, adaptateur AeroDataBox) ;
- les tests de base de données (parité des KPI à 4 heures de la journée et par compagnie, cloisonnement entre clients, droits par rôle) ;
- le test navigateur du mode données réelles (connexion, tuiles égales au calcul serveur, météo, benchmark, import, affichage téléphone).

Les mêmes tests tournent sur GitHub à chaque modification (`.github/workflows/ci.yml`).

## Avant le premier client payant

- [ ] Déplacer l'extension pg_net du schéma public vers `extensions` (avertissement de l'audit Supabase).
- [ ] Restreindre les origines autorisées des fonctions serveur (secret `ALLOWED_ORIGINS` = adresse du site).
- [ ] Passer Supabase en offre Pro (25 $/mois) : sauvegardes quotidiennes, pas de mise en pause. L'offre gratuite met le projet en pause après 7 jours d'inactivité.
- [ ] Activer la double authentification (Authentication → MFA) et désactiver les inscriptions publiques (les comptes sont créés par vous).
- [ ] Avoir un projet Supabase de préproduction distinct, pour tester les migrations avant la production.
- [ ] Mettre en place une surveillance des erreurs et de la disponibilité, avec une alerte si `cron.job_run_details` montre des échecs.
- [ ] Prévoir le volet juridique : CGU, accord de traitement des données (RGPD), contrat de licence du fournisseur de données de vol.
- [ ] Pour les grands comptes, prévoir la connexion avec leurs comptes d'entreprise (SSO SAML, disponible avec les offres supérieures de Supabase).
