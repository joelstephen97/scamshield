'use strict';
// Vercel cron: delete rows older than 180 days.
const db = require('../lib/db');
module.exports = async function handler(req, res) {
  const auth = String(req.headers.authorization || '');
  if (!process.env.CRON_SECRET || auth !== 'Bearer ' + process.env.CRON_SECRET) { res.status(401).end(); return; }
  const sql = db.getSql();
  const r = await sql`delete from reports where received_at < now() - interval '180 days'`;
  res.status(200).json({ ok: true, deleted: Array.isArray(r) ? r.length : null });
};
