// Removed: accepted UTR submissions by raw order UUID with no auth — anyone with an order id
// could lock payment with a bogus UTR. The real endpoint is /api/orders/track/[token]/utr.
import { json } from '../../../_shared/response.js';
export async function onRequestPost() { return json({ error: 'Not found' }, 404); }
