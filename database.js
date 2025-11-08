import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PG_HOST || '@db.szdoghayqkhfatrervtf.supabase.co',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'dbkasir',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '053455Singo',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 20,
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

export default pool;

