// AeroPulse · Règles des accès invités (sans dépendance : testées dans tests/unit.test.mjs).

/** Domaine technique des comptes invités : l'invité saisit seulement son identifiant, l'application ajoute ce domaine. */
export const GUEST_DOMAIN = "invite.aeropulse.app";
export const DEFAULT_ACCESS_MINUTES = 120;          // 2 h après la première connexion
export const DEFAULT_ACTIVATE_DAYS = 7;             // délai pour se connecter une première fois
export const MAX_ACTIVE_GUESTS = 25;                // par client

// Caractères sans ambiguïté à la lecture (pas de 0/O, 1/l/I).
const LOWER = "abcdefghjkmnpqrstuvwxyz", UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ", DIGITS = "23456789";

function pick(alphabet: string, n: number, rnd: (n: number) => Uint8Array): string {
  // Tirage sans biais : on rejette les octets au-delà du plus grand multiple de la taille de l'alphabet.
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < n) {
    for (const b of rnd(n * 2)) { if (b < limit && out.length < n) out += alphabet[b % alphabet.length]; }
  }
  return out;
}
const cryptoRnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** Identifiant lisible : « invite-k7m3qp ». */
export function makeUsername(rnd = cryptoRnd): string {
  return "invite-" + pick(LOWER + DIGITS, 6, rnd);
}

/** Mot de passe de 14 caractères en 3 groupes, avec majuscules, minuscules et chiffres : « Kq7m-Xp4t-R9wz ». */
export function makePassword(rnd = cryptoRnd): string {
  for (;;) {
    const all = LOWER + UPPER + DIGITS;
    const p = [pick(all, 4, rnd), pick(all, 4, rnd), pick(all, 4, rnd)].join("-");
    if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p)) return p;
  }
}

export function guestEmail(username: string): string {
  return `${username}@${GUEST_DOMAIN}`;
}

/** Durée d'accès en minutes, bornée entre 30 min et 30 jours. */
export function clampMinutes(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ACCESS_MINUTES;
  return Math.min(Math.max(n, 30), 30 * 24 * 60);
}

/** Délai de première connexion en jours, borné entre 1 et 30 jours. */
export function clampDays(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ACTIVATE_DAYS;
  return Math.min(Math.max(n, 1), 30);
}

/** État lisible d'une invitation. */
export function guestState(m: { first_login_at: string | null; expires_at: string | null; activate_before: string | null }, now = Date.now()):
  "en attente" | "active" | "expirée" {
  if (m.expires_at) return Date.parse(m.expires_at) > now ? "active" : "expirée";
  return m.activate_before && Date.parse(m.activate_before) > now ? "en attente" : "expirée";
}
