// Omni Token Queue - single entry point.
// Pure Node.js: no npm install required (node:http + node:sqlite).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from './src/env.js';
loadEnv('.env');

import { openDatabase } from './src/db.js';
import { Router, sendError } from './src/router.js';
import { readSession, parseCookies } from './src/auth.js';
import { broadcast } from './src/sse.js';

import { registerAuthRoutes } from './src/routes/auth.js';
import { registerMetaRoutes } from './src/routes/meta.js';
import { registerBranchRoutes } from './src/routes/branches.js';
import { registerDepartmentRoutes } from './src/routes/departments.js';
import { registerCounterRoutes } from './src/routes/counters.js';
import { registerServiceRoutes } from './src/routes/services.js';
import { registerQueueRuleRoutes } from './src/routes/queueRules.js';
import { registerTokenRoutes } from './src/routes/tokens.js';
import { registerDisplayRoutes } from './src/routes/display.js';
import { registerReportRoutes } from './src/routes/reports.js';
import { registerUserRoutes } from './src/routes/users.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');

const db = openDatabase();

const router = new Router();
registerAuthRoutes(router);
registerMetaRoutes(router);
registerBranchRoutes(router);
registerDepartmentRoutes(router);
registerCounterRoutes(router);
registerServiceRoutes(router);
registerQueueRuleRoutes(router);
registerTokenRoutes(router, { broadcast });
registerDisplayRoutes(router);
registerReportRoutes(router);
registerUserRoutes(router);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const PAGE_ALIASES = {
  '/': '/login.html',
  '/login': '/login.html',
  '/admin': '/admin.html',
  '/kiosk': '/kiosk.html',
  '/agent': '/agent.html',
  '/display': '/display.html',
};

async function serveStatic(req, res, pathname) {
  const aliased = PAGE_ALIASES[pathname] || pathname;
  const safePath = normalize(aliased).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  const body = await readFile(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());

    if (pathname.startsWith('/api/')) {
      const match = router.match(req.method, pathname);
      if (!match) return sendError(res, 404, 'Not found');

      const rawCookies = parseCookies(req.headers.cookie);
      const session = readSession(rawCookies['otq_session']);
      const ctx = { db, query, session, rawCookies };

      try {
        await match.handler(req, res, match.params, ctx);
      } catch (err) {
        console.error('[api error]', err);
        if (!res.headersSent) sendError(res, 500, 'Internal server error');
      }
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[server error]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  }
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`Omni Token Queue listening on http://localhost:${PORT}`);
  console.log(`  Admin dashboard : http://localhost:${PORT}/admin`);
  console.log(`  Kiosk           : http://localhost:${PORT}/kiosk`);
  console.log(`  Agent terminal  : http://localhost:${PORT}/agent`);
  console.log(`  TV display      : http://localhost:${PORT}/display`);
});
