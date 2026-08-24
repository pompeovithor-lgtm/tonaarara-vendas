const { sql } = require('@vercel/postgres');

// As tabelas são criadas sob demanda (idempotente — CREATE TABLE IF NOT
// EXISTS) na primeira query de cada cold start da função serverless, em vez
// de exigir uma migração manual antes do primeiro deploy.
let schemaReady = null;

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT,
          reset_token_hash TEXT,
          reset_token_expires BIGINT,
          created_at BIGINT NOT NULL
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS categories (
          name TEXT PRIMARY KEY
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          price DOUBLE PRECISION NOT NULL,
          size TEXT,
          category TEXT,
          status TEXT NOT NULL DEFAULT 'disponivel',
          images JSONB NOT NULL DEFAULT '[]',
          created_at BIGINT NOT NULL,
          sold_at BIGINT
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sales (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          price DOUBLE PRECISION NOT NULL,
          category TEXT,
          payment_method TEXT,
          sold_at BIGINT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          item_id TEXT,
          query TEXT,
          visitor_id TEXT,
          timestamp BIGINT NOT NULL
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS visits (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          referrer TEXT,
          visitor_id TEXT NOT NULL,
          device TEXT,
          timestamp BIGINT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS events_type_ts_idx ON events (type, timestamp)`;
      await sql`CREATE INDEX IF NOT EXISTS visits_ts_idx ON visits (timestamp)`;
    })();
  }
  return schemaReady;
}

module.exports = { sql, ensureSchema };
