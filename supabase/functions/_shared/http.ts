// AeroPulse · Utilitaires HTTP communs aux fonctions serveur (Deno / Supabase Edge Functions).
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const ok = ALLOWED.length === 0 || ALLOWED.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin || "*" : ALLOWED[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" } });
}

/** Client avec les droits du serveur (contourne la RLS) : réservé aux tâches planifiées. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, apiKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

/** Nouvelles clés (publishable / secret) si présentes, sinon clés historiques anon / service_role. */
function apiKey(newVar: string, legacyVar: string): string {
  try {
    const keys = JSON.parse(Deno.env.get(newVar) ?? "{}");
    if (keys.default) return keys.default;
  } catch { /* variable absente ou invalide */ }
  return Deno.env.get(legacyVar)!;
}

/** Client avec les droits de l'utilisateur qui appelle (la RLS s'applique). */
export function userClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, apiKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

/** Secret serveur : variable d'environnement, sinon Supabase Vault (fonction SQL get_setting, réservée au serveur). */
const cache = new Map<string, string | null>();
export async function getSetting(name: string, envName?: string): Promise<string | null> {
  const env = envName ? Deno.env.get(envName) : undefined;
  if (env) return env;
  if (cache.has(name)) return cache.get(name)!;
  const { data, error } = await serviceClient().rpc("get_setting", { p_name: name });
  const v = error ? null : (data as string | null);
  if (v) cache.set(name, v);            // une clé absente sera relue au prochain appel
  return v;
}

/** Les tâches planifiées doivent présenter le secret partagé (en-tête x-cron-secret). */
export async function checkCronSecret(req: Request): Promise<boolean> {
  const given = req.headers.get("x-cron-secret") ?? "";
  const secret = await getSetting("cron_secret", "CRON_SECRET");
  if (!secret || given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
