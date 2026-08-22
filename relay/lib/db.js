'use strict';
// Neon serverless SQL tagged template; swappable for tests.
let sql = null;
function getSql() {
  if (sql) return sql;
  const { neon } = require('@neondatabase/serverless');
  sql = neon(process.env.DATABASE_URL);
  return sql;
}
module.exports = { getSql, _setSql: (s) => { sql = s; } };
