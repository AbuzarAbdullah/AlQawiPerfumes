// Disabled: payment gateway removed.
import { json } from '../../../_shared/response.js';
export async function onRequestPost() { return json({ error: 'Gateway disabled' }, 410); }
