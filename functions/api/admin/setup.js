// One-shot bootstrap: creates the first admin user. Refuses once the table is non-empty.
import { json, badRequest } from '../../_shared/response.js';
import { isNonEmptyString } from '../../_shared/validate.js';
import { hashPassword } from '../../_shared/auth.js';

export async function onRequestPost({ request, env }) {
  // Must be explicitly enabled per-deploy so a fresh env can't be hijacked by whoever hits /setup first.
  if (env.ADMIN_SETUP_ENABLED !== '1') return json({ error: 'Setup disabled' }, 403);
  const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_users').first();
  if (existing.n > 0) return json({ error: 'Admin already exists — use login' }, 409);

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  if (!isNonEmptyString(body.username, 50) || !/^[a-z0-9_.-]+$/i.test(body.username.trim())) return badRequest('Username must be letters, digits, dot, underscore, hyphen');
  if (!isNonEmptyString(body.password, 200) || body.password.length < 10) return badRequest('Password must be at least 10 characters');

  const hash = await hashPassword(body.password);
  await env.DB.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').bind(body.username.trim(), hash).run();
  return json({ ok: true }, 201);
}
