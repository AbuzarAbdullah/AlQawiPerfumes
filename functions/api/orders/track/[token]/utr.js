// Customer submits a UPI reference + optional screenshot against their tracking token. NEVER marks payment as paid —
// only moves the payment row to 'submitted'. Admin verification is still required.
import { json, badRequest } from '../../../../_shared/response.js';
import { hashToken } from '../../../../_shared/tokens.js';

// shortcut: 512KB base64 cap, data URL stored on the payment row. Swap for R2 if traffic grows.
const MAX_SCREENSHOT_LEN = 512 * 1024;
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

export async function onRequestPost({ request, env, params }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  const utrRaw = typeof body.utr === 'string' ? body.utr.trim() : '';
  if (!/^\d{12,22}$/.test(utrRaw)) return badRequest('Enter a valid UPI transaction reference (12–22 digits)');

  let screenshot = null;
  if (body.screenshot) {
    if (typeof body.screenshot !== 'string' || body.screenshot.length > MAX_SCREENSHOT_LEN) return badRequest('Screenshot too large (max 512 KB)');
    if (!DATA_URL_RE.test(body.screenshot)) return badRequest('Screenshot must be a PNG/JPEG/WEBP image');
    screenshot = body.screenshot;
  }

  const hash = await hashToken(params.token);
  const order = await env.DB.prepare(
    'SELECT id, payment_status FROM orders WHERE tracking_token_hash = ?'
  ).bind(hash).first();
  if (!order) return json({ error: 'Order not found' }, 404);
  if (order.payment_status !== 'pending') return badRequest('A payment reference was already submitted for this order');

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE orders SET utr_reference = ?, payment_status = 'submitted', status = 'utr_submitted',
                         updated_at = datetime('now') WHERE id = ?`
    ).bind(utrRaw, order.id),
    env.DB.prepare(
      `UPDATE payments SET utr = ?, screenshot_data = ?, status = 'submitted', updated_at = datetime('now')
         WHERE order_id = ? AND method = 'upi_manual' AND status = 'pending'`
    ).bind(utrRaw, screenshot, order.id),
    env.DB.prepare(
      `INSERT INTO order_status_history (order_id, internal_status, customer_stage, note, actor)
       VALUES (?, 'payment_verification', 'confirmed', 'utr submitted', 'customer')`
    ).bind(order.id),
  ]);

  return json({ ok: true });
}
