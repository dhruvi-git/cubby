// Password vault encryption. Everything here runs in the browser: the passphrase
// and the key made from it never leave this device. The server only stores the
// encrypted results.

const ITERATIONS = 600_000; // PBKDF2-SHA256, OWASP's 2023+ recommendation
const CHECK = "cubby-vault-v1";

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
}
function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKey(passphrase: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function seal(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return toB64(out);
}

export async function open<T>(key: CryptoKey, blob: string): Promise<T> {
  const raw = fromB64(blob);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return JSON.parse(dec.decode(pt));
}

/** New vault: returns what the server stores (salt, iterations, encrypted check) plus the key. */
export async function createVault(passphrase: string) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  return { key, setup: { salt, iterations: ITERATIONS, check: await seal(key, { check: CHECK }) } };
}

/** Throws if the passphrase is wrong. */
export async function unlockVault(passphrase: string, salt: string, iterations: number, check: string): Promise<CryptoKey> {
  const key = await deriveKey(passphrase, salt, iterations);
  const value = await open<{ check: string }>(key, check).catch(() => null);
  if (value?.check !== CHECK) throw new Error("That passphrase isn't right.");
  return key;
}

// ---------- Generator, strength, breach check ----------
const SETS = { lower: "abcdefghijkmnopqrstuvwxyz", upper: "ABCDEFGHJKLMNPQRSTUVWXYZ", digits: "23456789", symbols: "!@#$%^&*-_=+?" };

function randomIndex(max: number): number {
  // Unbiased random integer in [0, max)
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}

export function generatePassword(length = 20, opts = { digits: true, symbols: true }): string {
  const pools = [SETS.lower, SETS.upper, ...(opts.digits ? [SETS.digits] : []), ...(opts.symbols ? [SETS.symbols] : [])];
  const all = pools.join("");
  const chars = pools.map((p) => p[randomIndex(p.length)]); // at least one of each kind
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomIndex(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "admin", "iloveyou", "abc123", "111111", "india"];

/** 0 (very weak) to 4 (strong). */
export function strength(pw: string): number {
  if (!pw) return 0;
  const low = pw.toLowerCase();
  if (COMMON.some((c) => low.includes(c)) && pw.length < 16) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (classes >= 3) score++;
  if (/(.)\1{2,}/.test(pw) || /^(?:\d+|[a-z]+)$/i.test(pw)) score = Math.max(0, score - 2);
  return Math.min(score, 4);
}

/** Has this password appeared in a known data breach? Uses Have I Been Pwned's
 *  k-anonymity API: only the first 5 characters of the password's SHA-1 hash are sent. */
export async function breachCount(pw: string): Promise<number> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", enc.encode(pw))))
    .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { "Add-Padding": "true" } });
  if (!res.ok) throw new Error("Breach check unavailable");
  const line = (await res.text()).split("\n").find((l) => l.startsWith(hash.slice(5)));
  return line ? Number(line.split(":")[1]) || 0 : 0;
}
