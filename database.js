// database.js
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 5,
});

// Enhanced error logging
pool.on('connect', () => {
  console.log('✅ Supabase database connected successfully to:', process.env.PG_HOST);
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

export default pool;
