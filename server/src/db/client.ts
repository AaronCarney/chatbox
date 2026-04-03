import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Execute a parameterized query against the database.
 */
export async function query(
  text: string,
  params?: (string | number | null)[]
) {
  return pool.query(text, params);
}

/**
 * Get all approved applications.
 */
export async function getApps() {
  const result = await pool.query(
    "SELECT * FROM apps WHERE status='approved'"
  );
  return result.rows;
}

/**
 * Get a specific application by ID.
 */
export async function getAppById(id: string) {
  const result = await pool.query('SELECT * FROM apps WHERE id=$1', [id]);
  return result.rows[0] || null;
}

export { pool };
