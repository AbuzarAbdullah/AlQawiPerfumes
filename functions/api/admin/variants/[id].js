// Protected: see note in functions/api/admin/orders.js — gate /api/admin/* with Cloudflare Access.
import { json, badRequest } from '../../../_shared/response.js';

export async function onRequestPatch({ request, env, params }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  const sets = [];
  const values = [];
  if (body.priceInr !== undefined) {
    if (body.priceInr !== null && (!Number.isInteger(body.priceInr) || body.priceInr < 0)) return badRequest('priceInr must be a non-negative integer or null');
    sets.push('price_inr = ?');
    values.push(body.priceInr);
  }
  if (body.active !== undefined) { sets.push('active = ?'); values.push(body.active ? 1 : 0); }
  if (!sets.length) return badRequest('No fields to update');

  values.push(params.id);
  const result = await env.DB.prepare(`UPDATE product_variants SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  if (result.meta.changes === 0) return json({ error: 'Variant not found' }, 404);
  return json({ ok: true });
}
