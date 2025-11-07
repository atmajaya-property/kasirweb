import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'dbkasir',
  user: 'postgres',        // ← PASTIKAN INI
  password: '053455',      // ← PASTIKAN INI
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully:', res.rows[0]);
  }
});


export default pool;

export default new Pool({
  // ... config lain
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
