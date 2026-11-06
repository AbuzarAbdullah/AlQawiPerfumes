// Customer submits a UPI reference against their tracking token. NEVER marks payment as paid —
// only moves the payment row to 'submitted'. Admin verification is still required.
import { json, badRequest } from '../../../../_shared/response.js';
import { isNonEmptyString } from '../../../../_shared/validate.js';
import { hashToken } from '../../../../_shared/tokens.js';

export async function onRequestPost({ request, env, params }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  if (!isNonEmptyString(body.utr, 50)) return badRequest('Enter the UPI transaction reference (UTR)');

  const hash = await hashToken(params.token);
  const order = await env.DB.prepare(
    'SELECT id, payment_status FROM orders WHERE tracking_token_hash = ?'
  ).bind(hash).first();
  if (!order) return json({ error: 'Order not found' }, 404);
  if (order.payment_status !== 'pending') return badRequest('A payment reference was already submitted for this order');

  const utr = body.utr.trim();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE orders SET utr_reference = ?, payment_status = 'submitted', status = 'utr_submitted',
                         updated_at = datetime('now') WHERE id = ?`
    ).bind(utr, order.id),
    env.DB.prepare(
      `UPDATE payments SET utr = ?, status = 'submitted', updated_at = datetime('now')
         WHERE order_id = ? AND method = 'upi_manual' AND status = 'pending'`
    ).bind(utr, order.id),
    env.DB.prepare(
      `INSERT INTO order_status_history (order_id, internal_status, customer_stage, note, actor)
       VALUES (?, 'payment_verification', 'confirmed', 'utr submitted', 'customer')`
    ).bind(order.id),
  ]);

  return json({ ok: true });
}
