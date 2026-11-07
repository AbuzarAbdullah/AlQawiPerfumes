// 10-digit numeric Order ID; SHA-256 hex stored server-side.
// shortcut: 10 digits = ~33 bits of entropy, enough for a boutique catalog; upgrade to 12+ digits or add rate-limiting if order volume grows.
export function newTrackingToken() {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  const n = ((BigInt(bytes[0]) << 32n) | BigInt(bytes[1])) % 10000000000n;
  return n.toString().padStart(10, '0');
}
export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function orderNumber(year, seq) {
  return `AQ-${year}-${String(seq).padStart(5, '0')}`;
}
