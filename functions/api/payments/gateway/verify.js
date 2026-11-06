// Frontend-return verification. Trust ONLY signature + amount match; the frontend callback is advisory.
// Order PAID only after all three checks pass. Webhook also drives this, so the two paths must be idempotent.
import { json, badRequest } from '../../../_shared/response.js';
import { hashToken } from '../../../_shared/tokens.js';
import { verifyPaymentSignature } from '../../../_shared/razorpay.js';
import { notifyOrder } from '../../../_shared/notify.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  const { trackingToken, razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;
  if (!trackingToken || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return badRequest('Missing fields');

  const hash = await hashToken(trackingToken);
  const order = await env.DB.prepare(
    'SELECT id, total_inr, payment_status FROM orders WHERE tracking_token_hash = ?'
  ).bind(hash).first();
  if (!order) return json({ error: 'Order not found' }, 404);

  const payment = await env.DB.prepare(
    `SELECT id, amount_inr, status FROM payments
      WHERE order_id = ? AND method = 'razorpay' AND gateway_order_id = ?`
  ).bind(order.id, razorpayOrderId).first();
  if (!payment) return json({ error: 'No matching payment attempt' }, 404);
  if (payment.amount_inr !== order.total_inr) return badRequest('Amount mismatch');

  const ok = await verifyPaymentSignature({
    keySecret: env.PAYMENT_GATEWAY_KEY_SECRET,
    razorpayOrderId, razorpayPaymentId, signature: razorpaySignature,
  });
  if (!ok) return json({ error: 'Signature verification failed' }, 400);

  // Idempotent: if webhook already PAID us, just return ok.
  if (payment.status === 'paid' && order.payment_status === 'paid') return json({ ok: true, alreadyPaid: true });

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE payments SET status = 'paid', gateway_payment_id = ?, gateway_signature = ?,
                           verified_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`
    ).bind(razorpayPaymentId, razorpaySignature, payment.id),
    env.DB.prepare(
      `UPDATE orders SET payment_status = 'paid', payment_method = 'razorpay',
                         status = 'paid', customer_stage = 'processing',
                         updated_at = datetime('now')
         WHERE id = ? AND payment_status != 'paid'`
    ).bind(order.id),
    env.DB.prepare(
      `INSERT INTO order_status_history (order_id, internal_status, customer_stage, note, actor)
       VALUES (?, 'preparing', 'processing', 'gateway payment verified', 'gateway')`
    ).bind(order.id),
  ]);
  await notifyOrder(env, order.id, 'payment_verified').catch(() => {});
  return json({ ok: true });
}
