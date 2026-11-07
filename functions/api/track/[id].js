// Removed: looked up orders by raw UUID and leaked customer_name + items with no auth (IDOR).
// The real public tracker is /api/orders/track/[token] — hashed-token lookup, no PII.
import { json } from '../../_shared/response.js';
export async function onRequestGet() { return json({ error: 'Not found' }, 404); }
