// Thin Razorpay provider. Swap this file for another gateway later — the API surface the rest of the app sees is just
// createGatewayOrder / verifyPaymentSignature / verifyWebhookSignature.
const enc = new TextEncoder();

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Create a Razorpay order. Returns the raw gateway payload. Amount is paise.
export async function createGatewayOrder({ keyId, keySecret, amountPaise, receipt, notes }) {
  if (!keyId || !keySecret) throw new Error('PAYMENT_GATEWAY_KEY_ID / _SECRET not configured');
  const basic = btoa(`${keyId}:${keySecret}`);
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'authorization': `Basic ${basic}`, 'content-type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.description || `Gateway order creation failed (${res.status})`);
  return data; // { id, amount, currency, status, receipt, ... }
}

// Payment-callback signature: HMAC-SHA256(secret, `${order_id}|${payment_id}`).
export async function verifyPaymentSignature({ keySecret, razorpayOrderId, razorpayPaymentId, signature }) {
  const expected = await hmacHex(keySecret, `${razorpayOrderId}|${razorpayPaymentId}`);
  return timingSafeEqualHex(expected, String(signature || '').toLowerCase());
}

// Webhook signature: HMAC-SHA256(webhook_secret, raw_body).
export async function verifyWebhookSignature({ webhookSecret, rawBody, signatureHeader }) {
  const expected = await hmacHex(webhookSecret, rawBody);
  return timingSafeEqualHex(expected, String(signatureHeader || '').toLowerCase());
}
