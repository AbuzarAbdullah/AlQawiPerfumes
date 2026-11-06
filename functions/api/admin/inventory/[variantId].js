import { json, badRequest } from '../../../_shared/response.js';

export async function onRequestPatch({ request, env, params }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  const qty = body.qtyAvailable;
  if (!Number.isInteger(qty) || qty < 0 || qty > 1_000_000) return badRequest('qtyAvailable must be a non-negative integer');

  const variantId = Number(params.variantId);
  if (!Number.isInteger(variantId)) return badRequest('Invalid variant id');
  const exists = await env.DB.prepare('SELECT 1 FROM product_variants WHERE id = ?').bind(variantId).first();
  if (!exists) return json({ error: 'Variant not found' }, 404);

  // Upsert — the migration seeded inventory rows for all existing variants, but future variants might miss one.
  await env.DB.prepare(
    `INSERT INTO inventory (variant_id, qty_available) VALUES (?, ?)
     ON CONFLICT(variant_id) DO UPDATE SET qty_available = excluded.qty_available`
  ).bind(variantId, qty).run();
  return json({ ok: true });
}
