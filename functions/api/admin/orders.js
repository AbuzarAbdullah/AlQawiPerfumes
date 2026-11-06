// Protected: this whole /api/admin/* path must be restricted to you via a Cloudflare Access
// application (Zero Trust dashboard) before launch. Without Access configured this is a public endpoint.
import { json } from '../../_shared/response.js';

export async function onRequestGet({ request, env }) {
  const status = new URL(request.url).searchParams.get('status');
  const stmt = status
    ? env.DB.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').bind(status)
    : env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC');
  const { results } = await stmt.all();
  return json(results);
}
