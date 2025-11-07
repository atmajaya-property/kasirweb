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

// Serve static files (untuk frontend)
app.use(express.static(join(__dirname, 'public')));

// Debug middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body).substring(0, 500) + '...');
  }
  next();
});

// ==================== HYBRID SYSTEM FUNCTIONS ====================

// Function untuk sync data ke Google Sheets dengan timeout
async function syncToGoogleSheets(action, data) {
  try {
    console.log(`🔄 Syncing to Google Sheets: ${action}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
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

    // Kirim telegram (background) - menggunakan fetch
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

// ==================== TEST ENDPOINTS ====================
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
      userCount: result.rows[0].count
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Database error: ' + error.message 
    });
  }
});

// Test endpoint untuk hybrid system - BISA DIAKSES VIA GET
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

// Test endpoint untuk simulasi transaksi hybrid
app.get('/api/test-transaction-hybrid', async (req, res) => {
  try {
    console.log('🧪 Testing hybrid transaction...');
    
    const testTransaction = {
      action: 'saveTransaksi',
      transaksi: [
        {
          id: 'M001',
          nama: 'TEST PRODUCT 1',
          harga: 10000,
          jumlah: 2,
          subtotal: 20000
        },
        {
          id: 'M002', 
          nama: 'TEST PRODUCT 2',
          harga: 15000,
          jumlah: 1,
          subtotal: 15000
        }
      ],
      total: 35000,
      idToko: 'T001',
      kasir: 'Test Kasir',
      bayar: 50000,
      kembali: 15000
    };
    
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testTransaction)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Hybrid transaction test SUCCESS:', result);
      res.json({ 
        success: true, 
        message: '✅ TRANSACTION SYNC WORKING! Data saved to Google Sheets.',
        googleSheetsResponse: result,
        testData: testTransaction
      });
    } else {
      console.log('❌ Hybrid transaction test FAILED:', response.status);
      res.json({ 
        success: false, 
        message: '❌ Transaction sync FAILED',
        status: response.status
      });
    }
  } catch (error) {
    console.error('💥 Hybrid transaction test ERROR:', error);
    res.json({ 
      success: false, 
      message: '💥 Transaction test ERROR: ' + error.message
    });
  }
});

// ==================== AUTH & USER ENDPOINTS ====================

// 1. LOGIN
app.post('/api/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body);
    const { username, password } = req.body;
    
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
      res.json({ 
        success: false, 
        message: 'Login gagal: username atau password salah.' 
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error login: ' + error.message 
    });
  }
});

// 2. GET USER MANAGEMENT
app.post('/api/getUserManagement', async (req, res) => {
  try {
    const { idToko, levelAkses, username } = req.body;
    
    let query = `
      SELECT username, nama_kasir, id_toko, nama_toko, status, level_akses, terakhir_login 
      FROM users 
      WHERE 1=1
    `;
    let params = [];
    
    // Filter berdasarkan level akses
    if (levelAkses === 'ADMIN') {
      query += ' AND id_toko = $1';
      params.push(idToko);
    } else if (levelAkses === 'KASIR') {
      query += ' AND username = $1';
      params.push(username);
    }
    // OWNER lihat semua, tidak perlu filter
    
    const usersResult = await pool.query(query, params);
    
        // Get toko data - 🔥 DIPERBAIKI: Hilangkan duplikat
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
    res.status(500).json({ 
      success: false, 
      message: 'Error mengambil data user: ' + error.message 
    });
  }
});

// 3. CREATE USER
app.post('/api/createUser', async (req, res) => {
  try {
    const { username, password, namaUser, toko, levelAkses, status, levelAksesCurrent, idToko } = req.body;
    
    // Permission check
    if (levelAksesCurrent === 'KASIR') {
      return res.json({ success: false, message: "Tidak memiliki akses" });
    }
    if (levelAksesCurrent === 'ADMIN' && (toko !== idToko || levelAkses !== 'KASIR')) {
      return res.json({ success: false, message: "Hanya bisa buat kasir untuk toko sendiri" });
    }
    
    // Validasi input
    if (!username || !password || !namaUser || !toko) {
      return res.json({ success: false, message: "Data tidak lengkap" });
    }
    
    // Cek duplikat username
    const existingUser = await pool.query(
      'SELECT username FROM users WHERE username = $1',
      [username]
    );
    
    if (existingUser.rows.length > 0) {
      return res.json({ success: false, message: "Username sudah digunakan" });
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
    res.status(500).json({ success: false, message: 'Error membuat user: ' + error.message });
  }
});

// 4. UPDATE USER
app.post('/api/updateUser', async (req, res) => {
  try {
    const { username, namaUser, toko, levelAkses, status, levelAksesCurrent, idToko } = req.body;
    
    // Permission check
    if (levelAksesCurrent === 'KASIR') {
      return res.json({ success: false, message: "Tidak memiliki akses" });
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
    res.status(500).json({ success: false, message: 'Error update user: ' + error.message });
  }
});

// 5. DELETE USER
app.post('/api/deleteUser', async (req, res) => {
  try {
    const { username, levelAksesCurrent } = req.body;
    
    // Permission check
    if (levelAksesCurrent === 'KASIR') {
      return res.json({ success: false, message: "Tidak memiliki akses" });
    }
    
    // Soft delete (ubah status)
    await pool.query(
      "UPDATE users SET status = 'Nonaktif' WHERE username = $1",
      [username]
    );
    
    res.json({ success: true, message: "User berhasil dihapus" });
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Error menghapus user: ' + error.message });
  }
});

// 6. RESET PASSWORD
app.post('/api/resetPassword', async (req, res) => {
  try {
    const { username, newPassword, levelAksesCurrent, currentUsername } = req.body;
    
    // Permission check
    if (levelAksesCurrent === 'KASIR' && username !== currentUsername) {
      return res.json({ success: false, message: "Hanya bisa reset password sendiri" });
    }
    
    // Update password
    await pool.query(
      "UPDATE users SET password = $1 WHERE username = $2",
      [newPassword, username]
    );
    
    res.json({ success: true, message: "Password berhasil direset" });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Error reset password: ' + error.message });
  }
});

// ==================== MENU ENDPOINTS ====================

// 7. GET MENU (untuk transaksi)
app.post('/api/getMenu', async (req, res) => {
  try {
    console.log('Get menu request:', req.body);
    const { idToko, levelAkses } = req.body;
    
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
    // OWNER lihat semua, tidak perlu filter

    console.log('Executing query:', query, 'with params:', params);
    const result = await pool.query(query, params);
    
    console.log('Menu found:', result.rows.length, 'items');
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error mengambil menu: ' + error.message 
    });
  }
});

// 8. GET MENU MANAGEMENT
app.post('/api/getMenuManagement', async (req, res) => {
  try {
    const { idToko, levelAkses } = req.body;
    
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
    res.status(500).json({ 
      success: false, 
      message: 'Error mengambil data menu: ' + error.message 
    });
  }
});

// 9. CREATE MENU
app.post('/api/createMenu', async (req, res) => {
  try {
    const { idToko, namaMenu, kategori, harga, stok, targetToko, levelAkses } = req.body;
    
    // Permission check
    if (levelAkses === 'KASIR') {
      return res.json({ success: false, message: "Tidak memiliki akses" });
    }
    if (levelAkses === 'ADMIN' && targetToko !== idToko && targetToko !== 'ALL') {
      return res.json({ success: false, message: "Hanya bisa buat menu untuk toko sendiri" });
    }
    
    // Validasi input
    if (!namaMenu || !kategori || !harga) {
      return res.json({ success: false, message: "Data tidak lengkap" });
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
    res.status(500).json({ success: false, message: 'Error membuat menu: ' + error.message });
  }
});

// 10. UPDATE MENU
app.post('/api/updateMenu', async (req, res) => {
  try {
    const { idMenu, namaMenu, kategori, harga, stok, status, targetToko, levelAkses } = req.body;
    
    // Permission check
    if (levelAkses === 'KASIR') {
      return res.json({ success: false, message: "Tidak memiliki akses" });
    }
    
    // Validasi input
    if (!idMenu || !namaMenu || !kategori || !harga) {
      return res.json({ success: false, message: "Data tidak lengkap" });
    }
    
    await pool.query(
      `UPDATE menu SET nama_menu = $1, kategori = $2, harga = $3, stok = $4, status = $5, id_toko = $6 
       WHERE id_menu = $7`,
      [namaMenu, kategori, harga, stok, status, targetToko, idMenu]
    );
    
    res.json({ success: true, message: "Menu berhasil diupdate" });
    
  } catch (error) {
    console.error('Update menu error:', error);
    res.status(500).json({ success: false, message: 'Error update menu: ' + error.message });
  }
});

// 11. DELETE MENU
app.post('/api/deleteMenu', async (req, res) => {
  try {
    const { idMenu, idToko, levelAkses } = req.body;
    
    // Permission check
    if (levelAkses === 'KASIR') {
      return res.json({ success: false, message: "Tidak memiliki akses" });
    }
    
    await pool.query(
      "DELETE FROM menu WHERE id_menu = $1",
      [idMenu]
    );
    
    res.json({ success: true, message: "Menu berhasil dihapus PERMANEN" });
    
  } catch (error) {
    console.error('Delete menu error:', error);
    res.status(500).json({ success: false, message: 'Error menghapus menu: ' + error.message });
  }
});

// ==================== TOKO ENDPOINTS ====================

// 12. GET TOKO - 🔥 DIPERBAIKI: HILANGKAN DUPLIKAT
app.post('/api/getToko', async (req, res) => {
  try {
    const { levelAkses } = req.body;
    
    // Validasi permission
    if (levelAkses === 'KASIR') {
      return res.json({ success: false, message: "Tidak memiliki akses" });
    }
    
    // 🔥 PERBAIKAN: Gunakan GROUP BY untuk pastikan id_toko benar-benar unik
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
    res.status(500).json({ 
      success: false, 
      message: 'Error mengambil data toko: ' + error.message 
    });
  }
});

// 13. CREATE TOKO
app.post('/api/createToko', async (req, res) => {
  try {
    const { namaToko, alamat, telepon, levelAkses } = req.body;
    
    // Permission check - hanya OWNER
    if (levelAkses !== 'OWNER') {
      return res.json({ success: false, message: "Hanya OWNER yang bisa membuat toko" });
    }
    
    // Validasi input
    if (!namaToko) {
      return res.json({ success: false, message: "Nama toko harus diisi" });
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
    res.status(500).json({ success: false, message: 'Error membuat toko: ' + error.message });
  }
});

// 14. UPDATE TOKO
app.post('/api/updateToko', async (req, res) => {
  try {
    const { idToko, namaToko, alamat, telepon, status, levelAkses } = req.body;
    
    // Permission check - hanya OWNER
    if (levelAkses !== 'OWNER') {
      return res.json({ success: false, message: "Hanya OWNER yang bisa mengedit toko" });
    }
    
    // Validasi input
    if (!idToko || !namaToko) {
      return res.json({ success: false, message: "Data tidak lengkap" });
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
    res.status(500).json({ success: false, message: 'Error update toko: ' + error.message });
  }
});

// 15. DELETE TOKO
app.post('/api/deleteToko', async (req, res) => {
  try {
    const { idToko, levelAkses } = req.body;
    
    // Permission check - hanya OWNER
    if (levelAkses !== 'OWNER') {
      return res.json({ success: false, message: "Hanya OWNER yang bisa menghapus toko" });
    }
    
    // Tidak boleh hapus toko ALL
    if (idToko === 'ALL') {
      return res.json({ success: false, message: "Tidak bisa menghapus toko ALL" });
    }
    
    // Soft delete (ubah status)
    await pool.query(
      "UPDATE toko SET status = 'Nonaktif' WHERE id_toko = $1",
      [idToko]
    );
    
    res.json({ success: true, message: "Toko berhasil dihapus" });
    
  } catch (error) {
    console.error('Delete toko error:', error);
    res.status(500).json({ success: false, message: 'Error menghapus toko: ' + error.message });
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
    
    // 🔥 HYBRID SYNC: Kirim data ke Google Sheets (BACKGROUND - tidak blocking)
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
    }, 1000); // Delay 1 detik untuk tidak blocking response
    
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
    res.status(500).json({ 
      success: false, 
      message: 'Error saat saveTransaksi: ' + error.message 
    });
  } finally {
    client.release();
  }
});

// 17. GET LAPORAN - VERSI DIPERBAIKI DENGAN FILTER
app.post('/api/getLaporan', async (req, res) => {
  try {
    console.log('📊 Get laporan request:', req.body);
    const { startDate, endDate, idToko, levelAkses, filterToko, filterMenu, username } = req.body;
    
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

    // 🔥 PERBAIKAN FILTER: Logic yang lebih jelas berdasarkan level akses
    
    if (levelAkses === 'ADMIN') {
      // ADMIN hanya bisa lihat toko sendiri
      paramCount++;
      query += ` AND id_toko = $${paramCount}`;
      params.push(idToko);
      console.log(`✅ Filter ADMIN: id_toko = ${idToko}`);
    } 
    else if (levelAkses === 'KASIR') {
      // KASIR hanya bisa lihat toko sendiri + transaksi sendiri
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
      // OWNER bisa filter berdasarkan toko tertentu
      if (filterToko && filterToko !== '') {
        paramCount++;
        query += ` AND id_toko = $${paramCount}`;
        params.push(filterToko);
        console.log(`✅ Filter OWNER: id_toko = ${filterToko}`);
      }
      // Jika OWNER tidak pilih filter toko, tampilkan semua toko (tidak ada filter)
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

    // Analytics sederhana dari data yang sudah diambil
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

    // Untuk categories, gunakan query terpisah yang lebih reliable
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
    res.status(500).json({ 
      success: false, 
      message: 'Error mengambil laporan: ' + error.message
    });
  }
});

// ==================== SETTING ENDPOINTS ====================

// 18. GET SETTING
app.post('/api/getSetting', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings');
    
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    
    res.json({ success: true, data: settings });
    
  } catch (error) {
    console.error('Get setting error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error mengambil setting: ' + error.message 
    });
  }
});

// 19. UPDATE SETTING
app.post('/api/updateSetting', async (req, res) => {
  try {
    const { settings, levelAkses } = req.body;
    
    // Permission check - hanya OWNER
    if (levelAkses !== 'OWNER') {
      return res.json({ success: false, message: "Hanya OWNER yang bisa mengedit setting" });
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
    res.status(500).json({ 
      success: false, 
      message: 'Error update setting: ' + error.message 
    });
  }
});

// ==================== HYBRID SYSTEM COMPATIBILITY ====================

// Endpoint untuk handle Google Apps Script style requests
app.post('/api/:action', async (req, res) => {
  try {
    const { action } = req.params;
    const body = req.body;
    
    console.log(`Hybrid request: ${action}`, body);
    
    // Mapping actions dari Google Script style ke PostgreSQL style
    const actionMap = {
      'login': 'login',
      'getMenu': 'getMenu',
      'getMenuManagement': 'getMenuManagement',
      'createMenu': 'createMenu',
      'updateMenu': 'updateMenu',
      'deleteMenu': 'deleteMenu',
      'getUserManagement': 'getUserManagement',
      'createUser': 'createUser',
      'updateUser': 'updateUser',
      'deleteUser': 'deleteUser',
      'resetPassword': 'resetPassword',
      'getToko': 'getToko',
      'createToko': 'createToko',
      'updateToko': 'updateToko',
      'deleteToko': 'deleteToko',
      'saveTransaksi': 'saveTransaksi',
      'getLaporan': 'getLaporan',
      'getSetting': 'getSetting',
      'updateSetting': 'updateSetting'
    };
    
    const mappedAction = actionMap[action];
    if (!mappedAction) {
      return res.status(404).json({ 
        success: false, 
        message: `Action tidak dikenali: ${action}` 
      });
    }
    
    // Redirect ke endpoint yang sesuai
    const mockReq = {
      ...req,
      body: body,
      originalUrl: `/api/${mappedAction}`
    };
    
    const mockRes = {
      json: (data) => res.json(data),
      status: (code) => ({
        json: (data) => res.status(code).json(data)
      })
    };
    
    // Panggil endpoint berdasarkan action
    if (mappedAction === 'login') {
      await loginHandler(mockReq, mockRes);
    } else if (mappedAction === 'getMenu') {
      await getMenuHandler(mockReq, mockRes);
    } else if (mappedAction === 'getLaporan') {
      await getLaporanHandler(mockReq, mockRes);
    } else {
      // Untuk action lainnya, return not implemented
      res.status(501).json({ 
        success: false, 
        message: `Action ${mappedAction} not implemented in hybrid mode` 
      });
    }
    
  } catch (error) {
    console.error('Hybrid endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing request: ' + error.message 
    });
  }
});

// Handler functions untuk hybrid system
async function loginHandler(req, res) {
  try {
    const { username, password } = req.body;
    
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2 AND status = $3',
      [username, password, 'Aktif']
    );

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
      res.json({ 
        success: false, 
        message: 'Login gagal: username atau password salah.' 
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error login: ' + error.message 
    });
  }
}

async function getMenuHandler(req, res) {
  try {
    const { idToko, levelAkses } = req.body;
    
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

    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error mengambil menu: ' + error.message 
    });
  }
}

async function getLaporanHandler(req, res) {
  try {
    const { startDate, endDate, idToko, levelAkses, filterToko, filterMenu, includeAnalytics } = req.body;
    
    // Panggil fungsi getLaporan utama dengan parameter yang sesuai
    const mockReq = { body: { startDate, endDate, idToko, levelAkses, filterToko, filterMenu, includeAnalytics } };
    const mockRes = {
      json: (data) => res.json(data),
      status: (code) => ({
        json: (data) => res.status(code).json(data)
      })
    };
    
    await app._router.handle(mockReq, mockRes);
  } catch (error) {
    console.error('Get laporan handler error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing laporan request: ' + error.message 
    });
  }
}

// ==================== FRONTEND SERVING ====================

// Serve frontend
app.get('/kasir', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Kasir Backend API is running!',
    endpoints: {
      test: '/api/test',
      testDb: '/api/test-db', 
      testHybrid: '/api/test-hybrid',
      testTransaction: '/api/test-transaction-hybrid',
      login: '/api/login',
      getMenu: '/api/getMenu',
      getMenuManagement: '/api/getMenuManagement',
      createMenu: '/api/createMenu',
      updateMenu: '/api/updateMenu',
      deleteMenu: '/api/deleteMenu',
      getUserManagement: '/api/getUserManagement',
      createUser: '/api/createUser',
      updateUser: '/api/updateUser',
      deleteUser: '/api/deleteUser',
      resetPassword: '/api/resetPassword',
      getToko: '/api/getToko',
      createToko: '/api/createToko',
      updateToko: '/api/updateToko',
      deleteToko: '/api/deleteToko',
      saveTransaksi: '/api/saveTransaksi',
      getLaporan: '/api/getLaporan',
      getSetting: '/api/getSetting',
      updateSetting: '/api/updateSetting',
      frontend: '/kasir'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Test endpoints:`);
  console.log(`   http://localhost:${PORT}/api/test`);
  console.log(`   http://localhost:${PORT}/api/test-db`);
  console.log(`   http://localhost:${PORT}/api/test-hybrid`);
  console.log(`   http://localhost:${PORT}/api/test-transaction-hybrid`);
  console.log(`   http://localhost:${PORT}/health`);
  console.log(`👨‍💼 Frontend: http://localhost:${PORT}/kasir`);
  console.log(`🌐 Hybrid System: ${GOOGLE_SCRIPT_URL ? 'ACTIVE' : 'INACTIVE'}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🔴 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 Unhandled Rejection at:', promise, 'reason:', reason);
});
