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

/**
 * Save a message to the chat history.
 */
export async function saveMessage(
  sessionPseudonym: string,
  role: string,
  content: string,
  toolCallId?: string,
  appId?: string
) {
  await pool.query(
    `INSERT INTO chat_messages (session_pseudonym, role, content, tool_call_id, app_id, data_classification)
     VALUES ($1, $2, $3, $4, $5, 'ephemeral_context')`,
    [sessionPseudonym, role, content, toolCallId || null, appId || null]
  );
}

/**
 * Get chat messages for a session.
 */
export async function getMessages(
  sessionPseudonym: string,
  limit: number = 30
) {
  const result = await pool.query(
    `SELECT role, content, tool_call_id, app_id, created_at
     FROM chat_messages
     WHERE session_pseudonym = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionPseudonym, limit]
  );
  return result.rows.reverse();
}

export { pool };
