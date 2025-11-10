// server.js - HYBRID SYSTEM WITH SUPABASE FIX
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './database.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.SERVER_PORT || 3000;

// ==================== KONFIGURASI HYBRID ====================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzrM2zFCnabXr6wgRHFJY7PPqUGJxTidsy26mH-oQKUEq7CWYLNHc_Xpkha7yw6bY4Q/exec";

// ==================== MIDDLEWARE & CONFIG ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({
  origin: ['http://localhost', 'http://127.0.0.1', 'http://localhost:3000', 'http://127.0.0.1:3000', 'file://'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Handle preflight requests
app.options('*', cors());

// Serve static files
app.use(express.static(join(__dirname, 'public')));

// Debug middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body).substring(0, 500) + '...');
  }
  next();
});

// ==================== DATABASE STATUS SYSTEM ====================
let isDatabaseConnected = false;

// Function to check database status
async function checkDatabaseStatus() {
  try {
    const result = await pool.query('SELECT 1 as status');
    isDatabaseConnected = true;
    console.log('✅ Database status: CONNECTED');
    return true;
  } catch (error) {
    isDatabaseConnected = false;
    console.log('❌ Database status: DISCONNECTED -', error.message);
    return false;
  }
}

// ==================== HYBRID SYSTEM FUNCTIONS ====================

// Function untuk sync data ke Google Sheets dengan timeout
async function syncToGoogleSheets(action, data) {
  try {
    console.log(`🔄 Syncing to Google Sheets: ${action}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: action,
        ...data
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Google Sheets sync success: ${action}`);
      return result;
    } else {
      console.warn(`⚠️ Google Sheets sync failed: ${action}`, response.status);
      return null;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`⏰ Google Sheets sync timeout: ${action}`);
    } else {
      console.warn(`⚠️ Google Sheets sync error: ${action}`, error.message);
    }
    return null;
  }
}

// Function untuk fallback ke Google Sheets ketika database down
async function hybridFallback(action, data, res) {
  try {
    console.log(`🔄 Using Google Sheets fallback for: ${action}`);
    
    const result = await syncToGoogleSheets(action, data);
    
    if (result) {
      return res.json({
        success: true,
        message: `Operation completed via Google Sheets (Database offline)`,
        data: result.data || [],
        fallback: true
      });
    } else {
      return res.status(503).json({
        success: false,
        message: 'Both database and fallback system are unavailable',
        error: 'Service temporarily unavailable'
      });
    }
  } catch (error) {
    console.error(`💥 Hybrid fallback error: ${error.message}`);
    return res.status(503).json({
      success: false,
      message: 'Fallback system error',
      error: error.message
    });
  }
}

// ==================== TELEGRAM FUNCTION ====================
async function kirimTelegram(idTransaksi, kasir, idToko, total, bayar, kembali, transaksi) {
  try {
    // Get telegram config dari database
    const result = await pool.query('SELECT token, chat_id FROM tlg ORDER BY id DESC LIMIT 1');
    
    if (result.rows.length === 0) {
      console.log("Telegram config not found in tlg table");
      return;
    }
    
    const { token, chat_id } = result.rows[0];
    
    if (!token || !chat_id) {
      console.log("Telegram token or chat_id missing");
      return;
    }

    let pesan = `🧾 *Transaksi Baru*\n`;
    pesan += `Kasir: ${kasir}\nToko: ${idToko}\nID Transaksi: ${idTransaksi}\n\n`;

    transaksi.forEach(item => {
      const subtotalRupiah = (item.subtotal || 0).toLocaleString('id-ID');
      pesan += `• ${item.nama} (${item.jumlah}x) = Rp${subtotalRupiah}\n`;
    });

    pesan += `\n💰 *Total:* Rp${(total || 0).toLocaleString('id-ID')}`;
    pesan += `\n💵 Tunai: Rp${(bayar || 0).toLocaleString('id-ID')}`;
    pesan += `\n🔄 Kembali: Rp${(kembali || 0).toLocaleString('id-ID')}`;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = {
      chat_id: chat_id,
      text: pesan,
      parse_mode: "Markdown"
    };

    // Kirim telegram (background)
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      console.log("Telegram sent successfully for:", idTransaksi);
    } else {
      console.log("Telegram send failed:", await response.text());
    }

  } catch (err) {
    console.log("Gagal kirim Telegram:", err.message);
  }
}

// ==================== HELPER FUNCTIONS ====================

// Helper function untuk mendapatkan nama kasir dari username
async function getKasirName(username) {
  try {
    if (!username) return 'Kasir';
    
    const result = await pool.query(
      'SELECT nama_kasir FROM users WHERE username = $1',
      [username]
    );
    return result.rows.length > 0 ? result.rows[0].nama_kasir : username;
  } catch (error) {
    console.error('Error getting kasir name:', error);
    return username || 'Kasir';
  }
}

// Error handling helper
function handleDatabaseError(error, res) {
  console.error('Database Error:', error);
  
  if (error.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'Data already exists'
    });
  } else if (error.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Referenced data not found'
    });
  } else if (error.code === '28P01') {
    return res.status(500).json({
      success: false,
      message: 'Database authentication failed'
    });
  } else if (error.code === 'ECONNREFUSED') {
    return res.status(503).json({
      success: false,
      message: 'Database service unavailable'
    });
  } else {
    return res.status(500).json({
      success: false,
      message: 'Database operation failed',
      error: error.message
    });
  }
}

// ==================== TEST & DEBUG ENDPOINTS ====================
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is working!',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM users');
    res.json({ 
      success: true, 
      message: 'Database is working!',
      userCount: result.rows[0].count,
      database: 'CONNECTED'
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Database error: ' + error.message,
      database: 'DISCONNECTED'
    });
  }
});

// Health check endpoint dengan status database
app.get('/api/health', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT 1 as status');
    const dbStatus = dbResult.rows[0].status === 1 ? 'healthy' : 'unhealthy';

    res.json({
      success: true,
      message: 'System is healthy',
      data: {
        server: 'healthy',
        database: dbStatus,
        hybrid_system: GOOGLE_SCRIPT_URL ? 'available' : 'unavailable',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Service unavailable',
      error: error.message,
      database: 'unhealthy'
    });
  }
});

// Debug endpoint untuk cek environment variables & koneksi
app.get('/api/debug-env', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW() as time');
    
    res.json({
      success: true,
      environment: {
        PG_HOST: process.env.PG_HOST ? '✅ Set' : '❌ Not set',
        PG_DATABASE: process.env.PG_DATABASE ? '✅ Set' : '❌ Not set',
        PG_USER: process.env.PG_USER ? '✅ Set' : '❌ Not set',
        PG_PASSWORD: process.env.PG_PASSWORD ? '✅ Set' : '❌ Not set',
        PG_PORT: process.env.PG_PORT ? '✅ Set' : '❌ Not set',
        NODE_ENV: process.env.NODE_ENV || 'Not set'
      },
      database: {
        connected: true,
        time: dbResult.rows[0].time
      },
      hybrid_system: {
        google_sheets_url: GOOGLE_SCRIPT_URL ? '✅ Configured' : '❌ Not configured'
      }
    });
  } catch (error) {
    res.json({
      success: false,
      environment: {
        PG_HOST: process.env.PG_HOST ? '✅ Set' : '❌ Not set',
        PG_DATABASE: process.env.PG_DATABASE ? '✅ Set' : '❌ Not set',
        PG_USER: process.env.PG_USER ? '✅ Set' : '❌ Not set',
        PG_PASSWORD: process.env.PG_PASSWORD ? '✅ Set' : '❌ Not set',
        PG_PORT: process.env.PG_PORT ? '✅ Set' : '❌ Not set',
        NODE_ENV: process.env.NODE_ENV || 'Not set'
      },
      database: {
        connected: false,
        error: error.message
      },
      hybrid_system: {
        google_sheets_url: GOOGLE_SCRIPT_URL ? '✅ Configured' : '❌ Not configured'
      }
    });
  }
});

// Test endpoint untuk hybrid system
app.get('/api/test-hybrid', async (req, res) => {
  try {
    console.log('🧪 Testing hybrid connection to Google Sheets...');
    
    const testData = {
      action: 'getMenu',
      idToko: 'T001', 
      levelAkses: 'OWNER'
    };
    
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Hybrid test SUCCESS:', result);
      res.json({ 
        success: true, 
        message: '✅ HYBRID SYSTEM CONNECTED! Google Sheets is working.',
        googleSheetsResponse: result
      });
    } else {
      console.log('❌ Hybrid test FAILED:', response.status);
      res.json({ 
        success: false, 
        message: '❌ Hybrid connection FAILED',
        status: response.status
      });
    }
  } catch (error) {
    console.error('💥 Hybrid test ERROR:', error);
    res.json({ 
      success: false, 
      message: '💥 Hybrid test ERROR: ' + error.message
    });
  }
});

// ==================== AUTH & USER ENDPOINTS ====================

// 1. LOGIN dengan hybrid fallback
app.post('/api/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body);
    const { username, password } = req.body;
    
    // Check database status first
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('login', { username, password }, res);
    }
    
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2 AND status = $3',
      [username, password, 'Aktif']
    );

    console.log('Login result:', result.rows.length, 'users found');

    if (result.rows.length > 0) {
      const user = result.rows[0];
      
      // Update last login
      await pool.query(
        'UPDATE users SET terakhir_login = $1 WHERE username = $2',
        [new Date(), username]
      );

      res.json({
        success: true,
        namaKasir: user.nama_kasir,
        idToko: user.id_toko,
        namaToko: user.nama_toko,
        levelAkses: user.level_akses,
        username: user.username
      });
    } else {
      res.status(401).json({ 
        success: false, 
        message: 'Login gagal: username atau password salah.' 
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    
    // Fallback to Google Sheets jika database error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('login', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 2. GET USER MANAGEMENT dengan deduplikasi
app.post('/api/getUserManagement', async (req, res) => {
  try {
    const { idToko, levelAkses, username } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('getUserManagement', req.body, res);
    }
    
    let query = `
      SELECT username, nama_kasir, id_toko, nama_toko, status, level_akses, terakhir_login 
      FROM users 
      WHERE 1=1
    `;
    let params = [];
    
    if (levelAkses === 'ADMIN') {
      query += ' AND id_toko = $1';
      params.push(idToko);
    } else if (levelAkses === 'KASIR') {
      query += ' AND username = $1';
      params.push(username);
    }

    const usersResult = await pool.query(query, params);
    
    // Get toko data dengan deduplikasi
    const tokoResult = await pool.query(`
      SELECT 
        id_toko, 
        MAX(nama_toko) as nama_toko,
        MAX(alamat) as alamat,
        MAX(telepon) as telepon,
        MAX(status) as status
      FROM toko 
      WHERE status = 'Aktif' AND id_toko != 'ALL'
      GROUP BY id_toko
      ORDER BY id_toko
    `);    
    
    res.json({
      success: true,
      users: usersResult.rows,
      toko: tokoResult.rows
    });
    
  } catch (error) {
    console.error('Get user management error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('getUserManagement', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 3. CREATE USER
app.post('/api/createUser', async (req, res) => {
  try {
    const { username, password, namaUser, toko, levelAkses, status, levelAksesCurrent, idToko } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('createUser', req.body, res);
    }
    
    // Permission check
    if (levelAksesCurrent === 'KASIR') {
      return res.status(403).json({ success: false, message: "Tidak memiliki akses" });
    }
    if (levelAksesCurrent === 'ADMIN' && (toko !== idToko || levelAkses !== 'KASIR')) {
      return res.status(403).json({ success: false, message: "Hanya bisa buat kasir untuk toko sendiri" });
    }
    
    // Validasi input
    if (!username || !password || !namaUser || !toko) {
      return res.status(400).json({ success: false, message: "Data tidak lengkap" });
    }
    
    // Cek duplikat username
    const existingUser = await pool.query(
      'SELECT username FROM users WHERE username = $1',
      [username]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: "Username sudah digunakan" });
    }
    
    // Dapatkan nama toko
    const tokoResult = await pool.query(
      'SELECT nama_toko FROM toko WHERE id_toko = $1',
      [toko]
    );
    
    const namaToko = tokoResult.rows.length > 0 ? tokoResult.rows[0].nama_toko : toko;
    
    // Insert user
    await pool.query(
      `INSERT INTO users (username, password, nama_kasir, id_toko, nama_toko, status, level_akses) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [username, password, namaUser, toko, namaToko, status, levelAkses]
    );
    
    res.json({ success: true, message: "User berhasil ditambahkan" });
    
  } catch (error) {
    console.error('Create user error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('createUser', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 4. UPDATE USER
app.post('/api/updateUser', async (req, res) => {
  try {
    const { username, namaUser, toko, levelAkses, status, levelAksesCurrent, idToko } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('updateUser', req.body, res);
    }
    
    // Permission check
    if (levelAksesCurrent === 'KASIR') {
      return res.status(403).json({ success: false, message: "Tidak memiliki akses" });
    }
    
    // Dapatkan nama toko
    const tokoResult = await pool.query(
      'SELECT nama_toko FROM toko WHERE id_toko = $1',
      [toko]
    );
    
    const namaToko = tokoResult.rows.length > 0 ? tokoResult.rows[0].nama_toko : toko;
    
    // Update user
    await pool.query(
      `UPDATE users SET nama_kasir = $1, id_toko = $2, nama_toko = $3, level_akses = $4, status = $5 
       WHERE username = $6`,
      [namaUser, toko, namaToko, levelAkses, status, username]
    );
    
    res.json({ success: true, message: "User berhasil diupdate" });
    
  } catch (error) {
    console.error('Update user error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('updateUser', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 5. DELETE USER
app.post('/api/deleteUser', async (req, res) => {
  try {
    const { username, levelAksesCurrent } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('deleteUser', req.body, res);
    }
    
    // Permission check
    if (levelAksesCurrent === 'KASIR') {
      return res.status(403).json({ success: false, message: "Tidak memiliki akses" });
    }
    
    // Soft delete (ubah status)
    await pool.query(
      "UPDATE users SET status = 'Nonaktif' WHERE username = $1",
      [username]
    );
    
    res.json({ success: true, message: "User berhasil dihapus" });
    
  } catch (error) {
    console.error('Delete user error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('deleteUser', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 6. RESET PASSWORD
app.post('/api/resetPassword', async (req, res) => {
  try {
    const { username, newPassword, levelAksesCurrent, currentUsername } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('resetPassword', req.body, res);
    }
    
    // Permission check
    if (levelAksesCurrent === 'KASIR' && username !== currentUsername) {
      return res.status(403).json({ success: false, message: "Hanya bisa reset password sendiri" });
    }
    
    // Update password
    await pool.query(
      "UPDATE users SET password = $1 WHERE username = $2",
      [newPassword, username]
    );
    
    res.json({ success: true, message: "Password berhasil direset" });
    
  } catch (error) {
    console.error('Reset password error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('resetPassword', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// ==================== MENU ENDPOINTS ====================

// 7. GET MENU (untuk transaksi) dengan hybrid fallback
app.post('/api/getMenu', async (req, res) => {
  try {
    console.log('Get menu request:', req.body);
    const { idToko, levelAkses } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('getMenu', req.body, res);
    }
    
    let query = `
      SELECT id_menu as id, nama_menu as nama, harga, kategori, stok 
      FROM menu 
      WHERE status = 'Aktif'
    `;
    
    let params = [];
    
    if (levelAkses === 'ADMIN') {
      query += ' AND (id_toko = $1 OR id_toko = $2)';
      params = [idToko, 'ALL'];
    } else if (levelAkses === 'KASIR') {
      query += ' AND (id_toko = $1 OR id_toko = $2)';
      params = [idToko, 'ALL'];
    }

    console.log('Executing query:', query, 'with params:', params);
    const result = await pool.query(query, params);
    
    console.log('Menu found:', result.rows.length, 'items');
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get menu error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('getMenu', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 8. GET MENU MANAGEMENT
app.post('/api/getMenuManagement', async (req, res) => {
  try {
    const { idToko, levelAkses } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('getMenuManagement', req.body, res);
    }
    
    let query = `
      SELECT id_menu, nama_menu, kategori, harga, stok, id_toko, status 
      FROM menu 
      WHERE 1=1
    `;
    
    let params = [];
    
    if (levelAkses === 'ADMIN') {
      query += ' AND (id_toko = $1 OR id_toko = $2)';
      params = [idToko, 'ALL'];
    } else if (levelAkses === 'KASIR') {
      query += ' AND (id_toko = $1 OR id_toko = $2) AND status = $3';
      params = [idToko, 'ALL', 'Aktif'];
    }

    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get menu management error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('getMenuManagement', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 9. CREATE MENU dengan hybrid sync
app.post('/api/createMenu', async (req, res) => {
  try {
    const { idToko, namaMenu, kategori, harga, stok, targetToko, levelAkses } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('createMenu', req.body, res);
    }
    
    // Permission check
    if (levelAkses === 'KASIR') {
      return res.status(403).json({ success: false, message: "Tidak memiliki akses" });
    }
    if (levelAkses === 'ADMIN' && targetToko !== idToko && targetToko !== 'ALL') {
      return res.status(403).json({ success: false, message: "Hanya bisa buat menu untuk toko sendiri" });
    }
    
    // Validasi input
    if (!namaMenu || !kategori || !harga) {
      return res.status(400).json({ success: false, message: "Data tidak lengkap" });
    }
    
    // Generate ID Menu
    const idResult = await pool.query(
      "SELECT COALESCE(MAX(CAST(SUBSTRING(id_menu FROM 2) AS INTEGER)), 0) + 1 as next_id FROM menu WHERE id_toko = $1 OR id_toko = 'ALL'",
      [targetToko]
    );
    const nextId = 'M' + String(idResult.rows[0].next_id).padStart(3, '0');
    
    // Insert menu ke PostgreSQL
    await pool.query(
      `INSERT INTO menu (id_menu, nama_menu, kategori, harga, id_toko, status, stok) 
       VALUES ($1, $2, $3, $4, $5, 'Aktif', $6)`,
      [nextId, namaMenu, kategori, harga, targetToko, stok]
    );
    
    console.log('✅ Menu saved to PostgreSQL:', nextId);
    
    // 🔥 HYBRID SYNC: Kirim data ke Google Sheets (BACKGROUND)
    setTimeout(async () => {
      try {
        const syncData = {
          idToko: idToko,
          namaMenu: namaMenu,
          kategori: kategori,
          harga: harga,
          stok: stok,
          targetToko: targetToko,
          levelAkses: levelAkses
        };
        
        await syncToGoogleSheets('createMenu', syncData);
        console.log('✅ Menu synced to Google Sheets');
      } catch (syncError) {
        console.log('⚠️ Menu saved to PostgreSQL only (Google Sheets sync failed):', syncError.message);
      }
    }, 1000);
    
    res.json({ success: true, message: "Menu berhasil ditambahkan", idMenu: nextId });
    
  } catch (error) {
    console.error('Create menu error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('createMenu', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 10. UPDATE MENU
app.post('/api/updateMenu', async (req, res) => {
  try {
    const { idMenu, namaMenu, kategori, harga, stok, status, targetToko, levelAkses } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('updateMenu', req.body, res);
    }
    
    // Permission check
    if (levelAkses === 'KASIR') {
      return res.status(403).json({ success: false, message: "Tidak memiliki akses" });
    }
    
    // Validasi input
    if (!idMenu || !namaMenu || !kategori || !harga) {
      return res.status(400).json({ success: false, message: "Data tidak lengkap" });
    }
    
    await pool.query(
      `UPDATE menu SET nama_menu = $1, kategori = $2, harga = $3, stok = $4, status = $5, id_toko = $6 
       WHERE id_menu = $7`,
      [namaMenu, kategori, harga, stok, status, targetToko, idMenu]
    );
    
    res.json({ success: true, message: "Menu berhasil diupdate" });
    
  } catch (error) {
    console.error('Update menu error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('updateMenu', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 11. DELETE MENU
app.post('/api/deleteMenu', async (req, res) => {
  try {
    const { idMenu, idToko, levelAkses } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('deleteMenu', req.body, res);
    }
    
    // Permission check
    if (levelAkses === 'KASIR') {
      return res.status(403).json({ success: false, message: "Tidak memiliki akses" });
    }
    
    await pool.query(
      "DELETE FROM menu WHERE id_menu = $1",
      [idMenu]
    );
    
    res.json({ success: true, message: "Menu berhasil dihapus PERMANEN" });
    
  } catch (error) {
    console.error('Delete menu error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('deleteMenu', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// ==================== TOKO ENDPOINTS ====================

// 12. GET TOKO dengan deduplikasi
app.post('/api/getToko', async (req, res) => {
  try {
    const { levelAkses } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('getToko', req.body, res);
    }
    
    // Validasi permission
    if (levelAkses === 'KASIR') {
      return res.status(403).json({ success: false, message: "Tidak memiliki akses" });
    }
    
    // Query dengan GROUP BY untuk pastikan id_toko unik
    const result = await pool.query(`
      SELECT 
        id_toko, 
        MAX(nama_toko) as nama_toko,
        MAX(alamat) as alamat,
        MAX(telepon) as telepon,
        MAX(status) as status
      FROM toko 
      WHERE status = 'Aktif' AND id_toko != 'ALL'
      GROUP BY id_toko
      ORDER BY id_toko
    `);
    
    console.log(`✅ Data toko setelah deduplikasi: ${result.rows.length} records`);
    
    res.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get toko error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('getToko', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 13. CREATE TOKO
app.post('/api/createToko', async (req, res) => {
  try {
    const { namaToko, alamat, telepon, levelAkses } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('createToko', req.body, res);
    }
    
    // Permission check - hanya OWNER
    if (levelAkses !== 'OWNER') {
      return res.status(403).json({ success: false, message: "Hanya OWNER yang bisa membuat toko" });
    }
    
    // Validasi input
    if (!namaToko) {
      return res.status(400).json({ success: false, message: "Nama toko harus diisi" });
    }
    
    // Generate ID Toko
    const idResult = await pool.query(
      "SELECT COALESCE(MAX(CAST(SUBSTRING(id_toko FROM 2) AS INTEGER)), 0) + 1 as next_id FROM toko WHERE id_toko != 'ALL'"
    );
    const nextId = 'T' + String(idResult.rows[0].next_id).padStart(3, '0');
    
    // Insert toko
    await pool.query(
      `INSERT INTO toko (id_toko, nama_toko, alamat, telepon, status) 
       VALUES ($1, $2, $3, $4, 'Aktif')`,
      [nextId, namaToko, alamat, telepon]
    );
    
    res.json({ success: true, message: "Toko berhasil dibuat", idToko: nextId });
    
  } catch (error) {
    console.error('Create toko error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('createToko', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 14. UPDATE TOKO
app.post('/api/updateToko', async (req, res) => {
  try {
    const { idToko, namaToko, alamat, telepon, status, levelAkses } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('updateToko', req.body, res);
    }
    
    // Permission check - hanya OWNER
    if (levelAkses !== 'OWNER') {
      return res.status(403).json({ success: false, message: "Hanya OWNER yang bisa mengedit toko" });
    }
    
    // Validasi input
    if (!idToko || !namaToko) {
      return res.status(400).json({ success: false, message: "Data tidak lengkap" });
    }
    
    // Update toko
    await pool.query(
      `UPDATE toko SET nama_toko = $1, alamat = $2, telepon = $3, status = $4 
       WHERE id_toko = $5`,
      [namaToko, alamat, telepon, status, idToko]
    );
    
    res.json({ success: true, message: "Toko berhasil diupdate" });
    
  } catch (error) {
    console.error('Update toko error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('updateToko', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 15. DELETE TOKO
app.post('/api/deleteToko', async (req, res) => {
  try {
    const { idToko, levelAkses } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('deleteToko', req.body, res);
    }
    
    // Permission check - hanya OWNER
    if (levelAkses !== 'OWNER') {
      return res.status(403).json({ success: false, message: "Hanya OWNER yang bisa menghapus toko" });
    }
    
    // Tidak boleh hapus toko ALL
    if (idToko === 'ALL') {
      return res.status(400).json({ success: false, message: "Tidak bisa menghapus toko ALL" });
    }
    
    // Soft delete (ubah status)
    await pool.query(
      "UPDATE toko SET status = 'Nonaktif' WHERE id_toko = $1",
      [idToko]
    );
    
    res.json({ success: true, message: "Toko berhasil dihapus" });
    
  } catch (error) {
    console.error('Delete toko error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('deleteToko', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// ==================== TRANSAKSI & LAPORAN ENDPOINTS ====================

// 16. SAVE TRANSAKSI + UPDATE STOK + HYBRID SYNC
app.post('/api/saveTransaksi', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { transaksi, total, idToko, kasir, bayar, kembali } = req.body;
    console.log('Save transaksi request:', { idToko, kasir, total, items: transaksi.length });
    
    // Generate ID Transaksi
    const now = new Date();
    const idTransaksi = `${idToko}-${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    
    // 1. UPDATE STOK di PostgreSQL
    for (const item of transaksi) {
      await client.query(
        'UPDATE menu SET stok = stok - $1 WHERE id_menu = $2',
        [item.jumlah, item.id]
      );
    }
    
    // 2. SAVE TRANSAKSI DETAIL ke PostgreSQL
    for (let i = 0; i < transaksi.length; i++) {
      const item = transaksi[i];
      await client.query(
        `INSERT INTO transaksi 
        (no_transaksi, tanggal, waktu, kasir, id_toko, item, jumlah, harga, subtotal, total, id_transaksi, bayar, kembali) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          i + 1,
          now.toISOString().split('T')[0],
          now.toTimeString().split(' ')[0],
          kasir,
          idToko,
          item.nama,
          item.jumlah,
          item.harga,
          item.subtotal,
          total,
          idTransaksi,
          bayar,
          kembali
        ]
      );
    }
    
    // 3. SAVE LAPORAN ke PostgreSQL
    await client.query(
      `INSERT INTO laporan 
      (tanggal, id_transaksi, kasir, total, bayar, kembali, status) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        now.toISOString().split('T')[0],
        idTransaksi,
        kasir,
        total,
        bayar,
        kembali,
        'SUKSES'
      ]
    );
    
    await client.query('COMMIT');
    
    console.log('✅ Transaksi saved successfully to PostgreSQL:', idTransaksi);
    
    // 🔥 HYBRID SYNC: Kirim data ke Google Sheets (BACKGROUND)
    setTimeout(async () => {
      try {
        const syncData = {
          transaksi: transaksi.map(item => ({
            id: item.id,
            nama: item.nama,
            harga: item.harga,
            jumlah: item.jumlah,
            subtotal: item.subtotal
          })),
          total: total,
          idToko: idToko,
          kasir: kasir,
          bayar: bayar,
          kembali: kembali
        };
        
        const syncResult = await syncToGoogleSheets('saveTransaksi', syncData);
        
        if (syncResult && syncResult.success) {
          console.log('✅ Data successfully synced to Google Sheets');
        } else {
          console.log('⚠️ Data saved to PostgreSQL only (Google Sheets sync failed)');
        }
      } catch (syncError) {
        console.log('⚠️ Google Sheets sync failed, but data saved to PostgreSQL:', syncError.message);
      }
    }, 1000);
    
    // Kirim telegram (background)
    kirimTelegram(idTransaksi, kasir, idToko, total, bayar, kembali, transaksi);
    
    res.json({
      success: true,
      message: "Transaksi tersimpan & stok diupdate",
      idTransaksi
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Save transaksi error:', error);
    
    // Fallback ke Google Sheets jika database error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('saveTransaksi', req.body, res);
    }
    
    handleDatabaseError(error, res);
  } finally {
    client.release();
  }
});

// 17. GET LAPORAN dengan filter yang diperbaiki
app.post('/api/getLaporan', async (req, res) => {
  try {
    console.log('📊 Get laporan request:', req.body);
    const { startDate, endDate, idToko, levelAkses, filterToko, filterMenu, username } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('getLaporan', req.body, res);
    }
    
    // Query utama untuk data transaksi
    let query = `
      SELECT 
        tanggal, 
        id_transaksi, 
        kasir,
        item,
        jumlah,
        harga,
        subtotal,
        total, 
        bayar, 
        kembali,
        id_toko
      FROM transaksi 
      WHERE 1=1
    `;
    let params = [];
    let paramCount = 0;

    console.log('🔧 Filter parameters:', {
      levelAkses, idToko, filterToko, filterMenu, startDate, endDate, username
    });

    // Filter berdasarkan level akses
    if (levelAkses === 'ADMIN') {
      paramCount++;
      query += ` AND id_toko = $${paramCount}`;
      params.push(idToko);
      console.log(`✅ Filter ADMIN: id_toko = ${idToko}`);
    } 
    else if (levelAkses === 'KASIR') {
      paramCount++;
      query += ` AND id_toko = $${paramCount}`;
      params.push(idToko);
      
      if (username) {
        const kasirName = await getKasirName(username);
        paramCount++;
        query += ` AND kasir = $${paramCount}`;
        params.push(kasirName);
        console.log(`✅ Filter KASIR: id_toko = ${idToko}, kasir = ${kasirName}`);
      }
    }
    else if (levelAkses === 'OWNER') {
      if (filterToko && filterToko !== '') {
        paramCount++;
        query += ` AND id_toko = $${paramCount}`;
        params.push(filterToko);
        console.log(`✅ Filter OWNER: id_toko = ${filterToko}`);
      }
    }

    // Filter menu
    if (filterMenu && filterMenu !== '' && filterMenu !== 'Semua Menu') {
      paramCount++;
      query += ` AND item = $${paramCount}`;
      params.push(filterMenu);
      console.log(`✅ Filter menu: item = ${filterMenu}`);
    }

    // Filter tanggal
    if (startDate) {
      paramCount++;
      query += ` AND tanggal >= $${paramCount}`;
      params.push(startDate);
      console.log(`✅ Filter startDate: ${startDate}`);
    }
    if (endDate) {
      paramCount++;
      query += ` AND tanggal <= $${paramCount}`;
      params.push(endDate);
      console.log(`✅ Filter endDate: ${endDate}`);
    }

    query += ' ORDER BY tanggal DESC, id_transaksi DESC';

    console.log('📋 Final query:', query);
    console.log('🔧 Query params:', params);

    const result = await pool.query(query, params);

    console.log('✅ Laporan found:', result.rows.length, 'records');

    // Calculate summary
    const summary = {
      totalTransaksi: result.rows.length,
      totalPendapatan: result.rows.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0),
      totalBayar: result.rows.reduce((sum, item) => sum + (parseFloat(item.bayar) || 0), 0),
      totalKembali: result.rows.reduce((sum, item) => sum + (parseFloat(item.kembali) || 0), 0)
    };

    // Analytics sederhana
    const itemSales = {};
    result.rows.forEach(row => {
      const itemName = row.item || 'Unknown';
      const quantity = parseInt(row.jumlah) || 0;
      itemSales[itemName] = (itemSales[itemName] || 0) + quantity;
    });

    const topItems = Object.entries(itemSales)
      .map(([nama, total_terjual]) => ({ nama, total_terjual }))
      .sort((a, b) => b.total_terjual - a.total_terjual)
      .slice(0, 5);

    let topCategories = [];
    try {
      const categoriesQuery = `
        SELECT m.kategori, SUM(t.jumlah) as total_terjual
        FROM transaksi t
        JOIN menu m ON t.item = m.nama_menu
        WHERE t.item = ANY($1)
        GROUP BY m.kategori 
        ORDER BY total_terjual DESC 
        LIMIT 6
      `;
      const menuNames = result.rows.map(row => row.item).filter(Boolean);
      
      if (menuNames.length > 0) {
        const categoriesResult = await pool.query(categoriesQuery, [menuNames]);
        topCategories = categoriesResult.rows;
      }
    } catch (categoriesError) {
      console.log('ℹ️ Categories analytics skipped:', categoriesError.message);
    }

    res.json({
      success: true,
      data: result.rows,
      summary: summary,
      analytics: {
        topItems: topItems,
        topCategories: topCategories
      }
    });

  } catch (error) {
    console.error('❌ Get laporan error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('getLaporan', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// ==================== SETTING ENDPOINTS ====================

// 18. GET SETTING
app.post('/api/getSetting', async (req, res) => {
  try {
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('getSetting', req.body, res);
    }
    
    const result = await pool.query('SELECT * FROM settings');
    
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    
    res.json({ success: true, data: settings });
    
  } catch (error) {
    console.error('Get setting error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('getSetting', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// 19. UPDATE SETTING
app.post('/api/updateSetting', async (req, res) => {
  try {
    const { settings, levelAkses } = req.body;
    
    // Check database status
    const dbStatus = await checkDatabaseStatus();
    if (!dbStatus) {
      return hybridFallback('updateSetting', req.body, res);
    }
    
    // Permission check - hanya OWNER
    if (levelAkses !== 'OWNER') {
      return res.status(403).json({ success: false, message: "Hanya OWNER yang bisa mengedit setting" });
    }
    
    // Update settings
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, value]
      );
    }
    
    res.json({ success: true, message: "Setting berhasil diupdate" });
    
  } catch (error) {
    console.error('Update setting error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return hybridFallback('updateSetting', req.body, res);
    }
    
    handleDatabaseError(error, res);
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint tidak ditemukan'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'production' ? 'Something went wrong' : error.message
  });
});

// ==================== START SERVER ====================

const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🚀 =================================`);
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️ Database Host: ${process.env.PG_HOST}`);
  console.log(`💾 Database Name: ${process.env.PG_DATABASE}`);
  console.log(`👤 Database User: ${process.env.PG_USER}`);
  console.log(`🌐 Hybrid System: ${GOOGLE_SCRIPT_URL ? 'ACTIVE' : 'INACTIVE'}`);
  console.log(`=================================\n`);

  // Test database connection on startup
  try {
    await checkDatabaseStatus();
  } catch (error) {
    console.error('❌ Startup database test failed:', error.message);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await pool.end();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  await pool.end();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;
