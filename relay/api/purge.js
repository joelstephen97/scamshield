'use strict';
// Vercel cron: delete rows older than 180 days.
const db = require('../lib/db');
const { tokenOk } = require('../lib/auth');
module.exports = async function handler(req, res) {
  const auth = String(req.headers.authorization || '');
  if (!tokenOk(auth, process.env.CRON_SECRET)) { res.status(401).end(); return; }
  // Vercel Cron sets x-vercel-cron on scheduled invocations. Require it in addition
  // to the bearer token so a leaked CRON_SECRET alone can't be used to trigger a
  // purge from outside Vercel's own cron system; manual triggering therefore needs
  // both the header and the bearer token.
  if (req.headers['x-vercel-cron'] === undefined) { res.status(401).end(); return; }
  try {
    const sql = db.getSql();
    const r = await sql`delete from reports where received_at < now() - interval '180 days'`;
    res.status(200).json({ ok: true, deleted: Array.isArray(r) ? r.length : null });
  } catch (e) { res.status(500).json({ error: 'db' }); }
};
module.exports._setSql = db._setSql;
