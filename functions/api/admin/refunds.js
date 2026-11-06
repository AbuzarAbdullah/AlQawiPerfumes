// Records a refund. If the payment was via Razorpay and credentials exist, calls the gateway;
// otherwise records a manual refund the operator processes in their UPI app.
import { json, badRequest } from '../../_shared/response.js';

async function razorpayRefund(env, gatewayPaymentId, amountPaise, notes) {
  if (!env.PAYMENT_GATEWAY_KEY_ID || !env.PAYMENT_GATEWAY_KEY_SECRET) return null;
  const basic = btoa(`${env.PAYMENT_GATEWAY_KEY_ID}:${env.PAYMENT_GATEWAY_KEY_SECRET}`);
  const res = await fetch(`https://api.razorpay.com/v1/payments/${gatewayPaymentId}/refund`, {
    method: 'POST',
    headers: { 'authorization': `Basic ${basic}`, 'content-type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, notes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.description || `Refund failed (${res.status})`);
  return data; // { id, status, amount, ... }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  const { orderId, amountInr, reason } = body;
  if (typeof orderId !== 'string') return badRequest('orderId required');
  if (!Number.isInteger(amountInr) || amountInr <= 0) return badRequest('amountInr must be a positive integer');

  const payment = await env.DB.prepare(
    `SELECT id, method, gateway_payment_id, amount_inr, status FROM payments
      WHERE order_id = ? AND status = 'paid' ORDER BY id DESC LIMIT 1`
  ).bind(orderId).first();
  if (!payment) return badRequest('No paid payment to refund');
  if (amountInr > payment.amount_inr) return badRequest('Refund exceeds payment amount');

  let gatewayRefundId = null;
  let status = 'pending';
  if (payment.method === 'razorpay' && payment.gateway_payment_id) {
    try {
      const gw = await razorpayRefund(env, payment.gateway_payment_id, amountInr * 100, { reason: reason || '' });
      gatewayRefundId = gw?.id || null;
      status = gw?.status === 'processed' ? 'processed' : 'pending';
    } catch (ex) {
      return json({ error: ex.message }, 502);
    }
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO refunds (payment_id, amount_inr, reason, status, gateway_refund_id) VALUES (?, ?, ?, ?, ?)`
    ).bind(payment.id, amountInr, reason || '', status, gatewayRefundId),
    env.DB.prepare(
      `UPDATE payments SET status = CASE WHEN ? = ? THEN 'refunded' ELSE 'refund_pending' END,
                           updated_at = datetime('now') WHERE id = ?`
    ).bind(amountInr, payment.amount_inr, payment.id),
    env.DB.prepare(
      `UPDATE orders SET payment_status = CASE WHEN ? = ? THEN 'refunded' ELSE 'refund_pending' END,
                         updated_at = datetime('now') WHERE id = ?`
    ).bind(amountInr, payment.amount_inr, orderId),
  ]);

  return json({ ok: true, refundId: gatewayRefundId, status });
}
