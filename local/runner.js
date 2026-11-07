// Mounts Cloudflare Pages Functions (functions/**/*.js) as Express routes.
// Keeps the function files unchanged — this shim gives them the Pages context shape.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

const METHOD_MAP = {
  onRequestGet: 'get', onRequestPost: 'post', onRequestPut: 'put',
  onRequestPatch: 'patch', onRequestDelete: 'delete', onRequestHead: 'head', onRequestOptions: 'options',
};

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// functions/api/admin/orders/[id]/cancel.js  ->  /api/admin/orders/:id/cancel
function routeFromPath(fnPath, functionsRoot) {
  const rel = path.relative(functionsRoot, fnPath).replace(/\\/g, '/').replace(/\.js$/, '');
  return '/' + rel.split('/').map(seg => seg.replace(/^\[(.+)\]$/, ':$1')).join('/');
}

// Build a web Request from an Express req.
function toWebRequest(req) {
  const url = `http://${req.headers.host || 'localhost'}${req.originalUrl}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    headers.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const init = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = Readable.toWeb(req);
    init.duplex = 'half';
  }
  return new Request(url, init);
}

// Stream a web Response back through an Express res.
async function sendWebResponse(response, res) {
  res.status(response.status);
  for (const [k, v] of response.headers) res.setHeader(k, v);
  if (!response.body) return res.end();
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}

// Compose Pages-style _middleware (context, next) into a single async handler.
function composeMiddleware(mwFns, handler) {
  return async function dispatch(context) {
    let i = -1;
    const run = async idx => {
      if (idx <= i) throw new Error('next() called twice');
      i = idx;
      if (idx === mwFns.length) return handler(context);
      const fn = mwFns[idx];
      return fn({ ...context, next: () => run(idx + 1) });
    };
    return run(0);
  };
}

export async function mountFunctions(app, env, functionsRoot) {
  const absRoot = path.resolve(functionsRoot);
  const allFiles = walk(absRoot);

  // Collect _middleware.js by directory (ancestor chain applies).
  const middlewareByDir = new Map();
  for (const f of allFiles) {
    if (path.basename(f) === '_middleware.js') {
      const mod = await import(pathToFileURL(f).href);
      if (typeof mod.onRequest === 'function') middlewareByDir.set(path.dirname(f), mod.onRequest);
    }
  }
  const middlewaresFor = fnPath => {
    const chain = [];
    let dir = path.dirname(fnPath);
    while (dir.startsWith(absRoot) || dir === absRoot) {
      if (middlewareByDir.has(dir)) chain.unshift(middlewareByDir.get(dir));
      if (dir === absRoot) break;
      dir = path.dirname(dir);
    }
    return chain;
  };

  for (const file of allFiles) {
    if (path.basename(file).startsWith('_')) continue;
    if (path.relative(absRoot, file).startsWith('_shared')) continue;

    const mod = await import(pathToFileURL(file).href);
    const routePath = routeFromPath(file, absRoot);
    const mws = middlewaresFor(file);

    for (const [exportName, expressMethod] of Object.entries(METHOD_MAP)) {
      const handler = mod[exportName];
      if (typeof handler !== 'function') continue;
      const composed = composeMiddleware(mws, handler);
      app[expressMethod](routePath, async (req, res, next) => {
        try {
          const context = {
            request: toWebRequest(req),
            env,
            params: req.params,
            data: {},
          };
          const response = await composed(context);
          if (!(response instanceof Response)) {
            res.status(500).json({ error: 'Handler did not return a Response' });
            return;
          }
          await sendWebResponse(response, res);
        } catch (err) {
          next(err);
        }
      });
    }

    // Plain onRequest (any method) — only register as fallback for files that don't export method-specific ones.
    if (typeof mod.onRequest === 'function' && !Object.keys(METHOD_MAP).some(k => typeof mod[k] === 'function')) {
      const composed = composeMiddleware(mws, mod.onRequest);
      app.all(routePath, async (req, res, next) => {
        try {
          const response = await composed({ request: toWebRequest(req), env, params: req.params, data: {} });
          await sendWebResponse(response, res);
        } catch (err) { next(err); }
      });
    }
  }
}
