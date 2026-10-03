/* AeroPulse · configuration de l'application.
 * Laisser vide pour le mode démonstration (données fictives, sans connexion).
 * Renseigner l'URL et la clé publique « anon » du projet Supabase pour les données réelles.
 * La clé anon est publique par conception : la sécurité repose sur les règles d'accès (RLS). */
window.AEROPULSE_CONFIG = {
  supabaseUrl: "",       // ex. "https://abcd1234.supabase.co"
  supabaseAnonKey: "",   // Project Settings → API → anon public
  allowDemo: true        // affiche « Voir la démo » sur l'écran de connexion
};
