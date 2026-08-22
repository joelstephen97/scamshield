'use strict';
// NDJSON export for model/pull_reports.py
const db = require('../lib/db');
const { tokenOk } = require('../lib/auth');
module.exports = async function handler(req, res) {
  const auth = String(req.headers.authorization || '');
  if (!tokenOk(auth, process.env.EXPORT_TOKEN)) { res.status(401).json({ error: 'unauthorized' }); return; }
  let since = new Date(0);
  if (req.query && req.query.since) {
    const d = new Date(req.query.since);
    if (Number.isNaN(d.getTime())) { res.status(400).json({ error: 'bad since' }); return; }
    since = d;
  }
  let limit = 5000;
  if (req.query && req.query.limit !== undefined) {
    const n = Number(req.query.limit);
    if (!Number.isInteger(n) || n < 1 || n > 20000) { res.status(400).json({ error: 'bad limit' }); return; }
    limit = n;
  }
  try {
    const sql = db.getSql();
    const rows = await sql`select id, received_at, payload from reports where received_at > ${since.toISOString()} order by id asc limit ${limit}`;
    res.status(200); res.setHeader('content-type', 'application/x-ndjson');
    for (const r of rows) res.write(JSON.stringify({ id: r.id, received_at: r.received_at, payload: r.payload }) + '\n');
    res.end();
  } catch (e) { res.status(500).json({ error: 'db' }); }
};
module.exports._setSql = db._setSql;
