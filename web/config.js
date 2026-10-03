/* AeroPulse · configuration de l'application.
 * Laisser supabaseUrl vide pour le mode démonstration (données fictives, sans connexion).
 * La clé « publishable » est publique par conception : la sécurité repose sur les règles d'accès (RLS). */
window.AEROPULSE_CONFIG = {
  supabaseUrl: "https://pfkteqdngzmlydueulyj.supabase.co",
  supabaseAnonKey: "sb_publishable_frPPfwlsarY_usJXCjYsZA_gHvy8Ol_",
  allowDemo: true        // affiche « Voir la démo » sur l'écran de connexion
};
