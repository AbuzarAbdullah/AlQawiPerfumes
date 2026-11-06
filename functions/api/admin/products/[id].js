// Protected: see note in functions/api/admin/orders.js — gate /api/admin/* with Cloudflare Access.
import { json, badRequest } from '../../../_shared/response.js';
import { isNonEmptyString } from '../../../_shared/validate.js';

export async function onRequestPatch({ request, env, params }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  const fields = ['name', 'brand', 'inspiration', 'family'];
  const sets = [];
  const values = [];
  for (const f of fields) {
    if (body[f] !== undefined) {
      if (!isNonEmptyString(body[f], 200)) return badRequest(`Invalid ${f}`);
      sets.push(`${f} = ?`);
      values.push(body[f].trim());
    }
  }
  if (body.active !== undefined) { sets.push('active = ?'); values.push(body.active ? 1 : 0); }
  if (!sets.length) return badRequest('No fields to update');

  values.push(params.id);
  const result = await env.DB.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  if (result.meta.changes === 0) return json({ error: 'Product not found' }, 404);
  return json({ ok: true });
}

// Soft delete only — keeps order history intact.
export async function onRequestDelete({ env, params }) {
  const result = await env.DB.prepare('UPDATE products SET active = 0 WHERE id = ?').bind(params.id).run();
  if (result.meta.changes === 0) return json({ error: 'Product not found' }, 404);
  return json({ ok: true });
}
