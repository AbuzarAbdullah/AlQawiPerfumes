// Disabled: payment gateway removed. Store accepts UPI (manual QR + UTR + screenshot) and COD only.
import { json } from '../../../_shared/response.js';
export async function onRequestPost() { return json({ error: 'Gateway disabled' }, 410); }
