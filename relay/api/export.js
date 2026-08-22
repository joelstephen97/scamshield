'use strict';
// NDJSON export for model/pull_reports.py
const db = require('../lib/db');
module.exports = async function handler(req, res) {
  const auth = String(req.headers.authorization || '');
  if (!process.env.EXPORT_TOKEN || auth !== 'Bearer ' + process.env.EXPORT_TOKEN) { res.status(401).json({ error: 'unauthorized' }); return; }
  const since = req.query && req.query.since ? new Date(req.query.since) : new Date(0);
  const limit = Math.min(Number((req.query && req.query.limit) || 5000), 20000);
  const sql = db.getSql();
  const rows = await sql`select id, received_at, payload from reports where received_at > ${since.toISOString()} order by id asc limit ${limit}`;
  res.status(200); res.setHeader('content-type', 'application/x-ndjson');
  for (const r of rows) res.write(JSON.stringify({ id: r.id, received_at: r.received_at, payload: r.payload }) + '\n');
  res.end();
};
module.exports._setSql = db._setSql;
