// AeroPulse · Accès invités temporaires (bouton « Partager » de l'application).
// POST JSON, utilisateur connecté et administrateur du client :
//   { action: "create", tenant, label?, minutes?, days? } → identifiant + mot de passe (affichés une seule fois)
//   { action: "list",   tenant }                          → invitations du client
//   { action: "revoke", tenant, user_id }                 → supprime le compte invité
// Tâche planifiée (en-tête x-cron-secret) : { action: "cleanup" } → supprime les comptes expirés.
// L'invité est « lecteur » : il voit les données du client mais ne peut rien importer ni modifier.
import { checkCronSecret, cors, json, serviceClient, userClient } from "../_shared/http.ts";
import { clampDays, clampMinutes, guestEmail, guestState, makePassword, makeUsername, MAX_ACTIVE_GUESTS } from "../_shared/guest.ts";

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Utilisez POST" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Corps JSON attendu" }, 400); }
  const admin = serviceClient();

  if (body.action === "cleanup" || req.headers.has("x-cron-secret")) {   // public.call_function envoie un corps vide
    if (!(await checkCronSecret(req))) return json(req, { error: "Accès refusé" }, 401);
    const now = new Date().toISOString();
    const { data, error } = await admin.from("memberships").select("user_id, expires_at, activate_before, first_login_at").eq("is_guest", true);
    if (error) return json(req, { error: error.message }, 500);
    const dead = (data ?? []).filter((m) => guestState(m) === "expirée").map((m) => m.user_id);
    let deleted = 0;
    for (const id of new Set(dead)) { const r = await admin.auth.admin.deleteUser(id); if (!r.error) deleted++; }
    return json(req, { ok: true, at: now, deleted });
  }

  const tenant = String(body.tenant ?? "");
  if (!UUID.test(tenant)) return json(req, { error: "Client manquant ou invalide" }, 400);
  const sb = userClient(req);
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return json(req, { error: "Connexion requise" }, 401);
  const { data: isAdmin } = await sb.rpc("has_role", { p_tenant: tenant, p_min: "admin" });
  if (!isAdmin) return json(req, { error: "Seul un administrateur du client peut partager un accès" }, 403);

  if (body.action === "list") {
    const { data, error } = await admin.from("memberships")
      .select("user_id, guest_username, label, created_at, activate_before, access_duration, first_login_at, expires_at")
      .eq("tenant_id", tenant).eq("is_guest", true).order("created_at", { ascending: false }).limit(100);
    if (error) return json(req, { error: error.message }, 500);
    return json(req, { ok: true, guests: (data ?? []).map((m) => ({ ...m, state: guestState(m) })) });
  }

  if (body.action === "revoke") {
    const uid = String(body.user_id ?? "");
    if (!UUID.test(uid)) return json(req, { error: "Invitation invalide" }, 400);
    const { data: m } = await admin.from("memberships").select("user_id").eq("tenant_id", tenant).eq("user_id", uid).eq("is_guest", true).maybeSingle();
    if (!m) return json(req, { error: "Invitation introuvable pour ce client" }, 404);
    const r = await admin.auth.admin.deleteUser(uid);
    if (r.error) return json(req, { error: r.error.message }, 500);
    return json(req, { ok: true });
  }

  if (body.action === "create") {
    const { data: act } = await admin.from("memberships").select("user_id, expires_at, activate_before, first_login_at").eq("tenant_id", tenant).eq("is_guest", true);
    if ((act ?? []).filter((m) => guestState(m) !== "expirée").length >= MAX_ACTIVE_GUESTS)
      return json(req, { error: `Limite de ${MAX_ACTIVE_GUESTS} invitations en cours atteinte : révoquez-en avant d'en créer d'autres` }, 429);

    const minutes = clampMinutes(body.minutes), days = clampDays(body.days);
    const label = String(body.label ?? "").trim().slice(0, 80) || null;
    const password = makePassword();
    let username = "", userId = "";
    for (let i = 0; i < 5 && !userId; i++) {          // nouvel essai en cas d'identifiant déjà pris
      username = makeUsername();
      const r = await admin.auth.admin.createUser({
        email: guestEmail(username), password, email_confirm: true,
        app_metadata: { guest: true }, user_metadata: { guest: true, label },
      });
      if (r.data?.user) userId = r.data.user.id;
      else if (r.error && !/already|exists|registered/i.test(r.error.message)) return json(req, { error: r.error.message }, 500);
    }
    if (!userId) return json(req, { error: "Impossible de générer un identifiant, réessayez" }, 500);

    const activateBefore = new Date(Date.now() + days * 86400e3).toISOString();
    const { error } = await admin.from("memberships").insert({
      tenant_id: tenant, user_id: userId, role: "viewer", is_guest: true, guest_username: username, label,
      created_by: auth.user.id, activate_before: activateBefore, access_duration: `${minutes} minutes`,
    });
    if (error) { await admin.auth.admin.deleteUser(userId); return json(req, { error: error.message }, 500); }
    return json(req, { ok: true, user_id: userId, username, password, minutes, activate_before: activateBefore });
  }

  return json(req, { error: "Action inconnue" }, 400);
});
