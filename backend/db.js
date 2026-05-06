import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      amount DECIMAL(10,2) NOT NULL,
      category VARCHAR(100) NOT NULL,
      date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

export default pool;
