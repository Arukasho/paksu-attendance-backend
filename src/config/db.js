const { Pool } = require('pg');

// Uses the pooled Supabase connection string (port 6543).
// ssl: { rejectUnauthorized: false } is needed for Supabase's managed Postgres.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = pool;
