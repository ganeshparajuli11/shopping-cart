import { neon } from '@neondatabase/serverless';

let client;
let ready;

// With no real DATABASE_URL (local development), use PGlite: a full Postgres
// that runs inside Node and saves its data in the .data folder.
function databaseUrl() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!url || url.includes('user:pass@host')) return '';
  return url;
}

async function localClient() {
  if (!globalThis.__wlPglite) {
    globalThis.__wlPglite = (async () => {
      let PGlite;
      try {
        ({ PGlite } = await import('@electric-sql/pglite'));
      } catch {
        throw new Error('No DATABASE_URL set and the local database is not installed. Run: npm install');
      }
      const path = await import('node:path');
      const db = new PGlite(path.join(process.cwd(), '.data', 'pglite'));
      await db.waitReady;
      return { query: async (text, params = []) => (await db.query(text, params)).rows };
    })().catch((e) => {
      globalThis.__wlPglite = undefined;
      throw e;
    });
  }
  return globalThis.__wlPglite;
}

async function getClient() {
  if (!client) {
    const url = databaseUrl();
    if (!url) {
      if (process.env.VERCEL) throw new Error('DATABASE_URL is not set. Connect a Neon database to this Vercel project.');
      return localClient();
    }
    client = neon(url);
  }
  return client;
}

// Creates the tables the first time the app talks to the database.
// Tables start with "wl_" so this app can share a database with the expense tracker safely.
async function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const sql = await getClient();
      await sql.query(`CREATE TABLE IF NOT EXISTS wl_products (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        store TEXT,
        name TEXT NOT NULL DEFAULT '',
        brand TEXT,
        model_code TEXT,
        variant TEXT,
        image_url TEXT,
        target_price NUMERIC(12,2),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
        status TEXT NOT NULL DEFAULT 'wishlist' CHECK (status IN ('wishlist', 'bought', 'dropped')),
        notes TEXT,
        bought_price NUMERIC(12,2),
        bought_store TEXT,
        bought_date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_checked_at TIMESTAMPTZ
      )`);
      // One row per price seen: the saved link, other shops Claude found, and re-checks over time.
      await sql.query(`CREATE TABLE IF NOT EXISTS wl_prices (
        id SERIAL PRIMARY KEY,
        product_id INT NOT NULL REFERENCES wl_products(id) ON DELETE CASCADE,
        store TEXT NOT NULL,
        url TEXT,
        price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
        was_price NUMERIC(12,2),
        delivery NUMERIC(12,2),
        in_stock BOOLEAN,
        note TEXT,
        source TEXT NOT NULL DEFAULT 'app',
        checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      await sql.query(`CREATE INDEX IF NOT EXISTS wl_prices_product_idx ON wl_prices (product_id, checked_at)`);
    })().catch((e) => {
      ready = undefined;
      throw e;
    });
  }
  return ready;
}

export async function q(text, params = []) {
  await ensureSchema();
  return (await getClient()).query(text, params);
}
