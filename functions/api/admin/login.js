import { json, badRequest } from '../../_shared/response.js';
import { isNonEmptyString } from '../../_shared/validate.js';
import { verifyPassword, signSession, sessionCookieHeader } from '../../_shared/auth.js';

const TTL = 60 * 60 * 8;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  if (!isNonEmptyString(body.username, 50) || !isNonEmptyString(body.password, 200)) return badRequest('Username and password required');

  const row = await env.DB.prepare('SELECT username, password_hash FROM admin_users WHERE username = ?').bind(body.username.trim()).first();
  // Constant-ish failure path so missing users look like wrong passwords.
  const ok = row ? await verifyPassword(body.password, row.password_hash) : false;
  if (!ok) return json({ error: 'Invalid credentials' }, 401);

  const token = await signSession(row.username, env.ADMIN_SESSION_SECRET, TTL);
  return new Response(JSON.stringify({ ok: true, username: row.username }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': sessionCookieHeader(token, TTL) },
  });
}
