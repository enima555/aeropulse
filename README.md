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
| `supabase/cron.sql` | Planification des collectes. |
| `supabase/seed_demo.sql` | Premier client et premier administrateur. |
| `docs/` | Définitions des KPI, format d'import. |
| `samples/` | Modèle CSV et jeu de démonstration (128 vols). |
| `tests/` | Tests unitaires, base de données (parité, sécurité), navigateur. |

## Mise en service

Prérequis : un compte GitHub, un compte Supabase et le compte Netlify existant. Pour la ligne de commande, il faut le [Supabase CLI](https://supabase.com/docs/guides/cli).

1. **Créer le projet Supabase** (région Europe, par exemple Paris ou Francfort). Notez l'identifiant du projet, l'URL, la clé `anon` et la clé `service_role` (Project Settings → API).
2. **Appliquer le schéma** :
   ```
   supabase login
   supabase link --project-ref <identifiant>
   supabase db push
   ```
3. **Définir les secrets des fonctions serveur** puis les déployer :
   ```
   supabase secrets set CRON_SECRET=<longue valeur aléatoire> ALLOWED_ORIGINS=https://<votre-site>.netlify.app
   supabase secrets set AERODATABOX_KEY=<clé RapidAPI>      # seulement si vous activez la synchro API
   supabase functions deploy ingest-metar
   supabase functions deploy sync-flights
   supabase functions deploy import-flights
   ```
4. **Planifier les collectes** : ouvrez `supabase/cron.sql`, remplacez `<PROJECT_REF>` et `<CRON_SECRET>`, puis exécutez le fichier dans l'éditeur SQL.
5. **Créer le premier utilisateur** (Authentication → Users → Add user). Exécutez ensuite `supabase/seed_demo.sql` en remplaçant l'e-mail.
6. **Configurer l'application** : renseignez `supabaseUrl` et `supabaseAnonKey` dans `web/config.js`. La clé anon est publique par conception, la sécurité repose sur les règles d'accès.
7. **Déployer sur Netlify** : reliez le dépôt GitHub au site. `netlify.toml` publie le dossier `web/` avec les en-têtes de sécurité.
8. **Côté Supabase** : dans Authentication → URL Configuration, mettez l'adresse Netlify comme Site URL, pour les liens de connexion par e-mail.

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

- [ ] Passer Supabase en offre Pro (25 $/mois) : sauvegardes quotidiennes, pas de mise en pause. L'offre gratuite met le projet en pause après 7 jours d'inactivité.
- [ ] Activer la double authentification (Authentication → MFA) et désactiver les inscriptions publiques (les comptes sont créés par vous).
- [ ] Avoir un projet Supabase de préproduction distinct, pour tester les migrations avant la production.
- [ ] Mettre en place une surveillance des erreurs et de la disponibilité, avec une alerte si `cron.job_run_details` montre des échecs.
- [ ] Prévoir le volet juridique : CGU, accord de traitement des données (RGPD), contrat de licence du fournisseur de données de vol.
- [ ] Pour les grands comptes, prévoir la connexion avec leurs comptes d'entreprise (SSO SAML, disponible avec les offres supérieures de Supabase).
