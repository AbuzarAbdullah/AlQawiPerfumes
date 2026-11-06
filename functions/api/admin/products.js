// Protected: see note in functions/api/admin/orders.js — gate /api/admin/* with Cloudflare Access.
import { json, badRequest } from '../../_shared/response.js';
import { isNonEmptyString } from '../../_shared/validate.js';

export async function onRequestGet({ env }) {
  const { results: products } = await env.DB.prepare('SELECT * FROM products ORDER BY id').all();
  const { results: variants } = await env.DB.prepare('SELECT * FROM product_variants ORDER BY product_id, ml').all();
  const byProduct = new Map(products.map(p => [p.id, { ...p, variants: [] }]));
  for (const v of variants) byProduct.get(v.product_id)?.variants.push(v);
  return json([...byProduct.values()]);
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  if (!isNonEmptyString(body.id, 20) || !/^[a-z0-9-]+$/.test(body.id)) return badRequest('id must be lowercase letters, numbers, hyphens');
  if (!isNonEmptyString(body.name, 100)) return badRequest('Name is required');
  if (!isNonEmptyString(body.brand, 100)) return badRequest('Brand is required');
  if (!isNonEmptyString(body.inspiration, 150)) return badRequest('Inspiration is required');
  if (!isNonEmptyString(body.family, 50)) return badRequest('Family is required');
  const sizes = Array.isArray(body.sizes) && body.sizes.length ? body.sizes : [10, 30, 50, 100];
  if (!sizes.every(Number.isInteger)) return badRequest('Sizes must be integers (ml)');

  const existing = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(body.id).first();
  if (existing) return badRequest('A product with this id already exists');

  await env.DB.batch([
    env.DB.prepare('INSERT INTO products (id, name, brand, inspiration, family) VALUES (?, ?, ?, ?, ?)')
      .bind(body.id, body.name.trim(), body.brand.trim(), body.inspiration.trim(), body.family.trim()),
    ...sizes.map(ml => env.DB.prepare('INSERT INTO product_variants (product_id, ml, price_inr) VALUES (?, ?, NULL)').bind(body.id, ml)),
  ]);
  return json({ ok: true }, 201);
}
