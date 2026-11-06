// Razorpay webhook: verifies signature, dedupes via payment_webhooks.event_id,
// and advances the payment+order on 'payment.captured'. Never trusts the body without the signature match.
import { json } from '../../../_shared/response.js';
import { verifyWebhookSignature } from '../../../_shared/razorpay.js';
import { notifyOrder } from '../../../_shared/notify.js';

export async function onRequestPost({ request, env }) {
  if (!env.PAYMENT_GATEWAY_WEBHOOK_SECRET) return json({ error: 'Webhook not configured' }, 503);
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  const ok = await verifyWebhookSignature({
    webhookSecret: env.PAYMENT_GATEWAY_WEBHOOK_SECRET,
    rawBody, signatureHeader: signature,
  });
  if (!ok) return json({ error: 'Invalid signature' }, 400);

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // event_id lives in the x-razorpay-event-id header; fall back to body.id so redeliveries dedupe cleanly.
  const eventId = request.headers.get('x-razorpay-event-id') || payload.id;
  if (!eventId) return json({ error: 'Missing event id' }, 400);

  // INSERT OR IGNORE is the dedupe primitive — changes==0 means we've already processed this event.
  const dedupe = await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_webhooks (event_id, provider, payload) VALUES (?, 'razorpay', ?)`
  ).bind(eventId, rawBody).run();
  if (dedupe.meta.changes === 0) return json({ ok: true, deduped: true });

  const event = payload.event;
  const entity = payload.payload?.payment?.entity;
  if (!entity) return json({ ok: true, ignored: true });

  const payment = await env.DB.prepare(
    `SELECT p.id, p.order_id, p.amount_inr, p.status, o.payment_status
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.method = 'razorpay' AND p.gateway_order_id = ?`
  ).bind(entity.order_id).first();
  if (!payment) return json({ ok: true, unknown: true });

  if (event === 'payment.captured' && entity.amount === payment.amount_inr * 100) {
    if (payment.status !== 'paid') {
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE payments SET status = 'paid', gateway_payment_id = ?, verified_at = datetime('now'),
                               updated_at = datetime('now') WHERE id = ?`
        ).bind(entity.id, payment.id),
        env.DB.prepare(
          `UPDATE orders SET payment_status = 'paid', payment_method = 'razorpay',
                             status = 'paid', customer_stage = 'processing', updated_at = datetime('now')
             WHERE id = ? AND payment_status != 'paid'`
        ).bind(payment.order_id),
        env.DB.prepare(
          `INSERT INTO order_status_history (order_id, internal_status, customer_stage, note, actor)
           VALUES (?, 'preparing', 'processing', 'webhook: payment.captured', 'gateway')`
        ).bind(payment.order_id),
      ]);
      await notifyOrder(env, payment.order_id, 'payment_verified').catch(() => {});
    }
  } else if (event === 'payment.failed') {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE payments SET status = 'failed', gateway_payment_id = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(entity.id, payment.id),
      env.DB.prepare(
        `UPDATE orders SET payment_status = 'failed', updated_at = datetime('now')
           WHERE id = ? AND payment_status NOT IN ('paid', 'refunded')`
      ).bind(payment.order_id),
    ]);
  }

  return json({ ok: true });
}
