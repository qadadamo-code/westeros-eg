/**
 * Face / fingerprint sign-in (Mohammed 2026-11-24): the phone or machine's own lock (Face ID, fingerprint,
 * Windows Hello) unlocks the person's PIN that this device keeps encrypted, then the normal PIN sign-in runs.
 * Nothing biometric ever leaves the device; the server still checks the PIN, so a PIN changed by management
 * simply makes the saved one fail and the person types the new PIN once.
 *
 * The PIN is encrypted with a key from the authenticator itself (WebAuthn "prf") where the device supports it,
 * otherwise with a key the browser keeps and cannot export (IndexedDB).
 */

export type BioRecord = { credId: string; memberId: string; name: string; iv: string; ct: string; mode: "prf" | "idb"; salt: string };

const recKey = (rid: string) => `westeros.bio.${rid}`;
const laterKey = (rid: string, mid: string) => `westeros.bio.later.${rid}.${mid}`;
const INFO = new TextEncoder().encode("westeros-pin");

const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const c of u) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string) => {
  const t = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const u = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
  return u;
};
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function bioRecords(rid: string): BioRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(recKey(rid)) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveRecords(rid: string, recs: BioRecord[]) {
  try {
    localStorage.setItem(recKey(rid), JSON.stringify(recs));
  } catch {
    /* private mode */
  }
}
export const hasBio = (rid: string, mid: string) => bioRecords(rid).some((r) => r.memberId === mid);

export function dropBio(rid: string, memberId: string) {
  const recs = bioRecords(rid);
  for (const r of recs) if (r.memberId === memberId) void idbDel(r.credId);
  saveRecords(rid, recs.filter((r) => r.memberId !== memberId));
}

/** "not now": the offer comes back after 30 days */
export function bioLater(rid: string, mid: string) {
  try {
    localStorage.setItem(laterKey(rid, mid), String(Date.now() + 30 * 864e5));
  } catch {
    /* ignore */
  }
}
const isLater = (rid: string, mid: string) => {
  try {
    return Number(localStorage.getItem(laterKey(rid, mid)) ?? 0) > Date.now();
  } catch {
    return false;
  }
};

let supported: Promise<boolean> | null = null;
export function bioSupported(): Promise<boolean> {
  if (!supported) {
    supported = (async () => {
      try {
        if (typeof window === "undefined" || !window.isSecureContext || !window.PublicKeyCredential || !crypto?.subtle) return false;
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      } catch {
        return false;
      }
    })();
  }
  return supported;
}

/* the PIN typed in this tab, kept in memory only, so the offer after the welcome can save it */
let pending: { rid: string; mid: string; name: string; pin: string } | null = null;
export function rememberPin(rid: string, mid: string, name: string, pin: string) {
  pending = { rid, mid, name, pin };
}
/** the PIN typed in this tab for this person, if still in memory */
export function takePin(mid: string): string | null {
  return pending?.mid === mid ? pending.pin : null;
}
export function forgetPin() {
  pending = null;
}
/** who may be offered face/fingerprint right now (null: nothing to offer) */
export async function bioOffer(): Promise<{ rid: string; mid: string; name: string } | null> {
  const p = pending;
  if (!p || hasBio(p.rid, p.mid) || isLater(p.rid, p.mid) || !(await bioSupported())) return null;
  return { rid: p.rid, mid: p.mid, name: p.name };
}

/* ---- keys ---- */

async function prfKey(out: ArrayBuffer) {
  const base = await crypto.subtle.importKey("raw", out, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: INFO }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("westeros-bio", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = fn(db.transaction("keys", mode).objectStore("keys"));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
const idbDel = (id: string) => idbOp("readwrite", (s) => s.delete(id)).catch(() => undefined);

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

/** turns face/fingerprint on for this person on this device; throws when the person cancels */
export async function enrollBio(rid: string, mid: string, name: string, pin: string): Promise<void> {
  const salt = rand(32);
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Westeros OS" },
      user: { id: rand(16), name, displayName: name },
      challenge: rand(32),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("cancelled");
  const credId = b64(cred.rawId);
  const ext = cred.getClientExtensionResults() as PrfResults;
  let out = ext.prf?.results?.first ?? null;
  if (!out && ext.prf?.enabled) {
    // some devices give the key only when signing in, not when registering
    const got = (await navigator.credentials.get({
      publicKey: { challenge: rand(32), allowCredentials: [{ type: "public-key", id: unb64(credId) }], userVerification: "required", timeout: 60_000, extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs },
    })) as PublicKeyCredential | null;
    out = (got?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first ?? null;
  }
  let key: CryptoKey;
  let mode: BioRecord["mode"];
  if (out) {
    key = await prfKey(out);
    mode = "prf";
  } else {
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await idbOp("readwrite", (s) => s.put(key, credId));
    mode = "idb";
  }
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(pin));
  dropBio(rid, mid);
  saveRecords(rid, [...bioRecords(rid), { credId, memberId: mid, name, iv: b64(iv), ct: b64(ct), mode, salt: b64(salt) }]);
  if (pending?.mid === mid) pending = null;
}

/** asks for face/fingerprint and returns whose PIN it unlocked; null when cancelled or nothing saved */
export async function bioUnlock(rid: string): Promise<{ memberId: string; pin: string } | null> {
  const recs = bioRecords(rid);
  if (!recs.length) return null;
  const evalByCredential: Record<string, { first: Uint8Array }> = {};
  for (const r of recs) if (r.mode === "prf") evalByCredential[r.credId] = { first: unb64(r.salt) };
  let got: PublicKeyCredential | null;
  try {
    got = (await navigator.credentials.get({
      publicKey: {
        challenge: rand(32),
        allowCredentials: recs.map((r) => ({ type: "public-key" as const, id: unb64(r.credId) })),
        userVerification: "required",
        timeout: 60_000,
        ...(Object.keys(evalByCredential).length ? { extensions: { prf: { evalByCredential } } as AuthenticationExtensionsClientInputs } : {}),
      },
    })) as PublicKeyCredential | null;
  } catch {
    return null;
  }
  if (!got) return null;
  const rec = recs.find((r) => r.credId === b64(got.rawId));
  if (!rec) return null;
  try {
    let key: CryptoKey | undefined;
    if (rec.mode === "prf") {
      const out = (got.getClientExtensionResults() as PrfResults).prf?.results?.first;
      if (out) key = await prfKey(out);
    } else key = await idbOp<CryptoKey>("readonly", (s) => s.get(rec.credId) as IDBRequest<CryptoKey>);
    if (!key) throw new Error("no key");
    const pin = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, key, unb64(rec.ct)));
    return { memberId: rec.memberId, pin };
  } catch {
    // the saved PIN can't be opened any more: forget it, the person signs in with the PIN and turns it on again
    dropBio(rid, rec.memberId);
    return null;
  }
}
