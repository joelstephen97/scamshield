'use strict';
const { validatePayload } = require('../lib/validate');
const db = require('../lib/db');
const rl = require('../lib/ratelimit');
const MAX = 32768;
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!rl.allow(ip)) { res.status(429).end(); return; }
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  if (!body) { res.status(400).json({ error: 'bad json' }); return; }
  if (JSON.stringify(body).length > MAX) { res.status(413).end(); return; }
  const v = validatePayload(body);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }
  try {
    const sql = db.getSql();
    await sql`insert into reports (kind,label,host,reg_domain,level,score,ext_version,payload)
      values (${body.kind},${body.label},${body.host},${body.regDomain},${body.level},${body.score},${body.extVersion},${JSON.stringify(body)}::jsonb)`;
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: 'db' }); }
};
function safeJson(s) { try { return JSON.parse(s); } catch (_) { return null; } }
module.exports._setSql = db._setSql; module.exports._resetLimiter = rl._reset;
