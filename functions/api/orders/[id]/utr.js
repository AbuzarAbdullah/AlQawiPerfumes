import { json, badRequest } from '../../../_shared/response.js';
import { isNonEmptyString } from '../../../_shared/validate.js';

export async function onRequestPost({ request, env, params }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  if (!isNonEmptyString(body.utr, 50)) return badRequest('Enter the UPI transaction reference (UTR)');

  const order = await env.DB.prepare('SELECT id, status FROM orders WHERE id = ?').bind(params.id).first();
  if (!order) return json({ error: 'Order not found' }, 404);
  if (order.status !== 'placed') return badRequest('A payment reference was already submitted for this order');

  await env.DB.prepare(
    `UPDATE orders SET utr_reference = ?, status = 'utr_submitted', updated_at = datetime('now') WHERE id = ?`
  ).bind(body.utr.trim(), params.id).run();

  return json({ ok: true });
}
