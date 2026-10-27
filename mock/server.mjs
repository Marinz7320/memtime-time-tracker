// Minimal local stand-in for the interview API, following API_V1_DOCUMENTATION.md.
// Useful for offline development and for exercising the rate limiter / error states.
//   node mock/server.mjs            -> http://localhost:8787
//   API_BASE_URL=http://localhost:8787 npm run dev
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 8787);
const KEY = process.env.MOCK_KEY || 'dev-key';
const LIMIT = Number(process.env.MOCK_LIMIT || 15);

const now = () => new Date().toISOString();
const stamp = { createdAt: '2025-01-15T10:30:00.000Z', updatedAt: '2025-01-15T10:30:00.000Z' };

const clients = [
  { id: 1, name: 'Acme Corp', description: 'Industrial supplies', status: 'active', ...stamp },
  { id: 2, name: 'Globex', description: 'Energy and utilities', status: 'active', ...stamp },
  { id: 3, name: 'Initech', description: 'Legacy contract', status: 'inactive', ...stamp },
];
const projects = [
  { id: 1, clientId: 1, name: 'Website redesign', status: 'active', ...stamp },
  { id: 2, clientId: 1, name: 'Mobile app', status: 'active', ...stamp },
  { id: 3, clientId: 2, name: 'Billing migration', status: 'active', ...stamp },
];
const projectTasks = {
  1: [
    { id: 1, parent: 0, name: 'Design mockups', status: 'active', ...stamp },
    { id: 2, parent: 1, name: 'Homepage', status: 'active', ...stamp },
    { id: 3, parent: 1, name: 'Checkout', status: 'active', ...stamp },
    { id: 4, parent: 0, name: 'Frontend build', status: 'active', ...stamp },
  ],
  2: [{ id: 5, parent: 0, name: 'Push notifications', status: 'inactive', ...stamp }],
  3: [
    { id: 6, parent: 0, name: 'Data mapping', status: 'active', ...stamp },
    { id: 7, parent: 0, name: 'Cut-over plan', status: 'active', ...stamp },
  ],
};
let entries = [];
let nextId = 1;
for (let d = 0; d < 14; d++) {
  const day = new Date();
  day.setDate(day.getDate() - d);
  day.setHours(9, 0, 0, 0);
  const end = new Date(day.getTime() + (2 + (d % 5)) * 3_600_000);
  entries.push({
    id: nextId++,
    taskId: [1, 2, 4, 6, 7][d % 5],
    userId: KEY,
    comment: `Seeded entry ${d + 1}`,
    start: day.toISOString(),
    end: end.toISOString(),
    createdAt: end.toISOString(),
    updatedAt: end.toISOString(),
  });
}

const hits = [];
function rateLimited() {
  const t = Date.now();
  while (hits.length && hits[0] <= t - 60_000) hits.shift();
  if (hits.length >= LIMIT) return true;
  hits.push(t);
  return false;
}

function page(list, q) {
  let out = [...list];
  const sortBy = q.get('sortBy');
  if (sortBy) {
    const dir = q.get('order') === 'desc' ? -1 : 1;
    out.sort((a, b) => (a[sortBy] > b[sortBy] ? dir : a[sortBy] < b[sortBy] ? -dir : 0));
  }
  const offset = Number(q.get('offset') ?? 0);
  const limit = Number(q.get('limit') ?? 10);
  return out.slice(offset, offset + limit);
}

function validBody(b) {
  return (
    b &&
    Number.isInteger(b.taskId) &&
    typeof b.comment === 'string' &&
    !Number.isNaN(Date.parse(b.start)) &&
    !Number.isNaN(Date.parse(b.end))
  );
}

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname.replace(/^\/api\/v1/, '');
    if (url.pathname === '/health') return res.end("I'm alive!");
    if (req.headers.authorization !== `Bearer ${KEY}`) return send(res, 401, { error: 'Unauthorized' });
    if (rateLimited()) return send(res, 429, { error: 'Too many requests' });

    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let m;
      const q = url.searchParams;
      if (req.method === 'GET' && path === '/clients') return send(res, 200, page(clients, q));
      if (req.method === 'GET' && (m = path.match(/^\/clients\/(\d+)\/projects$/)))
        return send(res, 200, page(projects.filter((p) => p.clientId === +m[1]), q));
      if (req.method === 'GET' && (m = path.match(/^\/projects\/(\d+)\/tasks$/)))
        return send(res, 200, page(projectTasks[m[1]] ?? [], q));
      if (req.method === 'GET' && (m = path.match(/^\/tasks\/(\d+)$/))) {
        const t = Object.values(projectTasks).flat().find((x) => x.id === +m[1]);
        return t ? send(res, 200, t) : send(res, 404, { error: 'Task not found' });
      }
      if (path === '/time-entries' && req.method === 'GET') return send(res, 200, page(entries, q));

      let body;
      if (req.method === 'POST' || req.method === 'PUT') {
        try {
          body = JSON.parse(raw);
        } catch {
          return send(res, 400, { error: 'Invalid JSON body' });
        }
        if (!validBody(body)) return send(res, 400, { error: 'Invalid JSON body' });
      }
      if (path === '/time-entries' && req.method === 'POST') {
        const e = { id: nextId++, userId: KEY, ...body, start: new Date(body.start).toISOString(), end: new Date(body.end).toISOString(), createdAt: now(), updatedAt: now() };
        entries.push(e);
        return send(res, 201, e);
      }
      if ((m = path.match(/^\/time-entries\/(\d+)$/))) {
        const idx = entries.findIndex((e) => e.id === +m[1]);
        if (req.method === 'GET') return idx < 0 ? send(res, 404, { error: 'Time entry not found' }) : send(res, 200, entries[idx]);
        if (idx < 0) return send(res, 404, { error: `Time entry #${m[1]} not found` });
        if (req.method === 'PUT') {
          entries[idx] = { ...entries[idx], ...body, start: new Date(body.start).toISOString(), end: new Date(body.end).toISOString(), updatedAt: now() };
          return send(res, 200, entries[idx]);
        }
        if (req.method === 'DELETE') {
          entries.splice(idx, 1);
          return send(res, 200, { message: 'Time entry deleted successfully' });
        }
      }
      send(res, 404, { error: 'Not found' });
    });
  })
  .listen(PORT, () => console.log(`Mock API on http://localhost:${PORT} (key: ${KEY}, limit ${LIMIT}/min)`));
