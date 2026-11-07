// Local dev server — runs the whole Cloudflare Pages app under plain Node + MariaDB.
// Same function files, same frontend, same SQL (minor dialect shim in local/db.js).
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDB } from './local/db.js';
import { mountFunctions } from './local/runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8788);

const DB = createDB({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3308),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'alqawiperfume',
});

// env object mirrors what Cloudflare Pages Functions see at runtime.
const env = {
  DB,
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  PAYMENT_GATEWAY_KEY_ID: process.env.PAYMENT_GATEWAY_KEY_ID,
  PAYMENT_GATEWAY_KEY_SECRET: process.env.PAYMENT_GATEWAY_KEY_SECRET,
  PAYMENT_GATEWAY_WEBHOOK_SECRET: process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  NOTIFY_FROM_EMAIL: process.env.NOTIFY_FROM_EMAIL,
  NOTIFY_BCC_EMAIL: process.env.NOTIFY_BCC_EMAIL,
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  ENFORCE_INVENTORY: process.env.ENFORCE_INVENTORY,
};

const app = express();
app.disable('x-powered-by');

await mountFunctions(app, env, path.join(__dirname, 'functions'));

// Static site last so API routes win.
app.use(express.static(__dirname, { extensions: ['html'], index: 'index.html' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: String(err?.message || err) });
});

app.listen(PORT, () => {
  console.log(`Alqawi local server:  http://localhost:${PORT}`);
  console.log(`DB: mariadb ${env.DB._pool.config?.connectionConfig?.host}:${env.DB._pool.config?.connectionConfig?.port} / ${process.env.DB_NAME}`);
});
