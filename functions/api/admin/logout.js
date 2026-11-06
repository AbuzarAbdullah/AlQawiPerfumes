import { sessionCookieHeader } from '../../_shared/auth.js';

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': sessionCookieHeader('', 0) },
  });
}
