// Admin auth: PBKDF2 password hashing + HMAC-signed session cookie. No server-side session store.
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64dec = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const enc = new TextEncoder();

const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterStr, saltB, hashB] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2') return false;
  const salt = b64dec(saltB);
  const expected = b64dec(hashB);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: Number(iterStr), hash: 'SHA-256' }, key, 256));
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(username, secret, ttlSeconds = 60 * 60 * 8) {
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${username}.${exp}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64(sig)}`;
}

export async function verifySession(cookieValue, secret) {
  if (!cookieValue || !secret) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  const [username, expStr, sigB] = parts;
  const exp = Number(expStr);
  if (!username || !Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64dec(sigB), enc.encode(`${username}.${expStr}`));
  return ok ? { username, exp } : null;
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionCookieHeader(value, maxAgeSeconds) {
  const bits = [`admin_session=${value}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict'];
  if (maxAgeSeconds === 0) bits.push('Max-Age=0');
  else if (maxAgeSeconds) bits.push(`Max-Age=${maxAgeSeconds}`);
  return bits.join('; ');
}
