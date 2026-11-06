export const isNonEmptyString = (v, maxLen = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
export const isIndianPhone = v => typeof v === 'string' && /^(\+91[\-\s]?)?[6-9]\d{9}$/.test(v.trim());
export const isIndianPincode = v => typeof v === 'string' && /^[1-9]\d{5}$/.test(v.trim());
export const isEmail = v => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.length <= 200;

export async function verifyTurnstile(token, secret) {
  if (!token || typeof token !== 'string') return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
  });
  const data = await res.json();
  return data.success === true;
}
