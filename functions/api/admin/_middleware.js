// Gates everything under /api/admin/* — except the login/setup entry points — behind a signed session cookie.
import { json } from '../../_shared/response.js';
import { readCookie, verifySession } from '../../_shared/auth.js';

const PUBLIC_PATHS = new Set(['/api/admin/login', '/api/admin/logout', '/api/admin/setup']);

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);
  if (PUBLIC_PATHS.has(pathname)) return next();

  const session = await verifySession(readCookie(request, 'admin_session'), env.ADMIN_SESSION_SECRET);
  if (!session) return json({ error: 'Unauthorized' }, 401);
  context.data = { ...(context.data || {}), admin: session.username };
  return next();
}
