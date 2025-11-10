// database.js - SUPABASE VERSION
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

// Konfigurasi khusus untuk Supabase
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: {
    rejectUnauthorized: false,
    require: true
  },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10, // Increased for better performance
  // Parameter khusus Supabase
  statement_timeout: 30000,
  query_timeout: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true
});

// Enhanced connection logging
pool.on('connect', (client) => {
  console.log('✅ Connected to Supabase PostgreSQL');
});

pool.on('acquire', (client) => {
  console.log('🔗 Client acquired from pool');
});

pool.on('remove', (client) => {
  console.log('🔌 Client removed from pool');
});

pool.on('error', (err, client) => {
  console.error('❌ Database error:', err);
  console.error('🔧 Error details:', {
    code: err.code,
    message: err.message,
    host: process.env.PG_HOST
  });
});

// Test connection on startup
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as time, version() as version');
    console.log('✅ Supabase Connection Test:');
    console.log('   📅 Time:', result.rows[0].time);
    console.log('   🗄️  Database:', process.env.PG_DATABASE);
    console.log('   🌐 Host:', process.env.PG_HOST);
    client.release();
  } catch (error) {
    console.error('❌ Supabase Connection Failed:');
    console.error('   🔧 Error:', error.message);
    console.error('   📍 Host:', process.env.PG_HOST);
    console.error('   👤 User:', process.env.PG_USER);
    console.error('   💾 Database:', process.env.PG_DATABASE);
    
    // Suggest solutions based on error
    if (error.code === '28P01') {
      console.error('   💡 Solution: Check your Supabase password in .env file');
    } else if (error.code === 'ENOTFOUND') {
      console.error('   💡 Solution: Check PG_HOST in .env - should be db.xxx.supabase.co');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('   💡 Solution: Check PG_PORT and ensure Supabase is running');
    }
  }
};

// Run connection test
testConnection();

export default pool;
