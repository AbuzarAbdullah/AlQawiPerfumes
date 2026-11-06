// base64url(random 24 bytes) → ~32-char opaque token; SHA-256 hex stored server-side.
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function newTrackingToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return b64url(bytes.buffer);
}
export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function orderNumber(year, seq) {
  return `AQ-${year}-${String(seq).padStart(5, '0')}`;
}
