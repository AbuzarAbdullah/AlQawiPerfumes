// D1-compatible adapter over MariaDB/MySQL (mysql2). Mimics env.DB so the
// functions/**/*.js files can run unchanged on Node locally and on Cloudflare D1 in prod.
import mysql from 'mysql2/promise';

// Rewrites the few SQLite-isms our queries use into MariaDB equivalents.
// Keep this list narrow — adding more means hunting bugs. Expand only when a real query needs it.
function rewrite(sql) {
  return sql
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/\bINSERT\s+OR\s+IGNORE\b/gi, 'INSERT IGNORE')
    .replace(/\bON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET\b/gi, 'ON DUPLICATE KEY UPDATE')
    .replace(/\bexcluded\.(\w+)/gi, 'VALUES($1)')
    .replace(/\blast_insert_rowid\s*\(\s*\)/gi, 'LAST_INSERT_ID()');
}

class Statement {
  constructor(exec, sql, params = []) { this.exec = exec; this.sql = rewrite(sql); this.params = params; }
  bind(...params) { return new Statement(this.exec, this.sql, params); }
  async first() {
    const [rows] = await this.exec(this.sql, this.params);
    return rows[0] ?? null;
  }
  async all() {
    const [rows] = await this.exec(this.sql, this.params);
    return { results: rows };
  }
  async run() {
    const [result] = await this.exec(this.sql, this.params);
    return { meta: { last_row_id: result.insertId ?? null, changes: result.affectedRows ?? 0 } };
  }
}

export function createDB(poolCfg) {
  const pool = mysql.createPool({ ...poolCfg, waitForConnections: true, connectionLimit: 10, multipleStatements: false });
  const exec = (sql, params) => pool.execute(sql, params);
  return {
    prepare(sql) { return new Statement(exec, sql); },
    async batch(statements) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const out = [];
        for (const s of statements) {
          const [result] = await conn.execute(s.sql, s.params);
          out.push({ meta: { last_row_id: result.insertId ?? null, changes: result.affectedRows ?? 0 } });
        }
        await conn.commit();
        return out;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },
    _pool: pool,
  };
}
