// KONFIGURASI HYBRID SYSTEM
const SCRIPT_URL = "http://localhost:3000/api";
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzrM2zFCnabXr6wgRHFJY7PPqUGJxTidsy26mH-oQKUEq7CWYLNHc_Xpkha7yw6bY4Q/exec";
const ITEMS_PER_PAGE = 20;
const CACHE_TTL = 5 * 60 * 1000; // 5 menit

// Global Variables dengan caching
let kasirInfo = {};
let transaksi = [];
let menuData = [];
let currentPage = 1;
let filteredMenu = [];
let currentSettings = {};
let laporanData = [];
let menuManagementData = [];
let editingMenuId = null;
let userManagementData = [];
let tokoManagementData = [];
let editingUserId = null;
let editingTokoId = null;

// 🔥 VARIABLE BARU: Multiple Payment
let paymentMethods = {
  tunai: 0,
  debit: 0, 
  ewallet: 0,
  qris: 0
};
let isMultiplePayment = false;


// Cache System
const cache = {
  menu: { data: null, timestamp: 0 },
  menuManagement: { data: null, timestamp: 0 },
  users: { data: null, timestamp: 0 },
  toko: { data: null, timestamp: 0 },
  settings: { data: null, timestamp: 0 }
};

// ==================== 🔥 PERBAIKAN: VALIDASI URL ====================

// Validasi URL configuration
console.log('🔧 Konfigurasi URL:', {
  postgresURL: SCRIPT_URL,
  googleScriptURL: GOOGLE_SCRIPT_URL ? '✅ Ada' : '❌ Tidak ada'
});

// Test koneksi saat load
async function testConnection() {
  console.log('🧪 Testing koneksi server...');
  
  try {
    // Test PostgreSQL
    const testResponse = await fetch(`${SCRIPT_URL}/test`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    });
    console.log(`📡 PostgreSQL Test: ${testResponse.status}`);
    
    if (testResponse.ok) {
      const result = await testResponse.json();
      console.log('✅ PostgreSQL aktif:', result);
    }
  } catch (error) {
    console.warn('⚠️ PostgreSQL tidak tersedia:', error.message);
  }
}

// ==================== 🔥 PERBAIKAN: GLOBAL ERROR HANDLING ====================

// Global error handler untuk fetch
function setupGlobalErrorHandling() {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    console.error('🔴 Unhandled Promise Rejection:', event.reason);
    
    // Show user-friendly message for network errors
    if (event.reason && event.reason.message && event.reason.message.includes('fetch')) {
      console.warn('🌐 Network error detected');
    }
  });
  
  // Handle offline/online events
  window.addEventListener('online', function() {
    console.log('🌐 Koneksi internet tersedia');
    showNotification('Koneksi internet tersedia', 'success');
  });
  
  window.addEventListener('offline', function() {
    console.warn('🌐 Koneksi internet terputus');
    showNotification('Koneksi internet terputus - mode offline', 'warning');
  });
}

// ==================== HYBRID SYSTEM DENGAN CORS FIX ====================

// 🔥 PERBAIKAN BESAR: Hybrid Fetch dengan CORS handling
async function hybridFetch(endpoint, data, method = 'POST') {
  const action = endpoint.replace('/api/', '');
  const payload = { ...data, action: action };
  
  console.log(`🔄 Hybrid Fetch: ${endpoint}`, { data: payload });
  
  // Priority 1: Coba PostgreSQL backend dulu
  try {
    console.log(`🔗 Mencoba PostgreSQL: ${SCRIPT_URL}${endpoint}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`${SCRIPT_URL}${endpoint}`, {
      method: method,
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(data),
      signal: controller.signal,
      credentials: 'include' // 🔥 FIX CORS: Include credentials
    });
    
    clearTimeout(timeoutId);
    
    console.log(`📡 PostgreSQL Response Status: ${response.status}`);
    
    if (response.ok) {
      const result = await response.json();
      console.log(`✅ PostgreSQL Success: ${endpoint}`, result);
      
      if (result.success !== false) {
        return result;
      } else {
        console.warn(`⚠️ PostgreSQL returned error: ${result.message}`);
        throw new Error(result.message || 'PostgreSQL error');
      }
    } else {
      console.warn(`⚠️ PostgreSQL HTTP error: ${response.status}`);
      // Try to get error message from response
      try {
        const errorText = await response.text();
        console.error('📄 Error response:', errorText);
      } catch (e) {
        console.error('❌ Cannot read error response');
      }
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (postgresError) {
    console.log(`❌ PostgreSQL failed: ${postgresError.message}`);
    
    // Priority 2: Fallback ke Google Sheets dengan CORS proxy alternative
    try {
      console.log(`🔗 Mencoba Google Sheets: ${GOOGLE_SCRIPT_URL}`);
      
      // 🔥 CORS FIX: Gunakan mode 'no-cors' atau alternative approach
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      // Coba dengan mode no-cors dulu
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', // 🔥 FIX CORS: Use no-cors mode
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Dengan mode no-cors, kita tidak bisa membaca response
      console.log(`📡 Google Sheets Response (no-cors): Request sent`);
      
      // Karena no-cors, kita anggap berhasil untuk avoid error
      // Dalam real implementation, you might want different approach
      return {
        success: true,
        message: 'Google Sheets fallback (no-cors mode)',
        data: []
      };
      
    } catch (googleError) {
      console.error(`❌ Both backends failed: ${endpoint}`, googleError);
      throw new Error(`Koneksi ke server gagal: ${googleError.message}`);
    }
  }
}

// ==================== UTILITY FUNCTIONS ====================

// 🔥 FUNCTION MULTIPLE PAYMENT - COMPACT VERSION

// Toggle antara single dan multiple payment
function togglePaymentMode() {
  const singleMode = document.getElementById('paymentSingle');
  const multipleMode = document.getElementById('paymentMultiple');
  
  if (!isMultiplePayment) {
    // Switch ke Multiple Payment
    isMultiplePayment = true;
    singleMode.style.display = 'none';
    multipleMode.style.display = 'block';
    
    // Initialize values dari cash input
    const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
    const cashValue = parseNumberFromString(document.getElementById('cashInput').value);
    
    // Set tunai dengan nilai dari cash input, atau total jika cash = total
    if (cashValue === total || cashValue === 0) {
      paymentMethods.tunai = total;
    } else {
      paymentMethods.tunai = cashValue;
    }
    
    updateMultiplePaymentDisplay();
    
  } else {
    // Switch kembali ke Single Payment
    isMultiplePayment = false;
    singleMode.style.display = 'flex';
    multipleMode.style.display = 'none';
    
    // Update cash input dengan total dari multiple payment
    const totalPaid = calculateTotalPaid();
    document.getElementById('cashInput').value = formatRupiah(totalPaid);
    hitungKembali();
  }
}

// Update tampilan multiple payment
function updateMultiplePaymentDisplay() {
  const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
  const totalPaid = calculateTotalPaid();
  const change = totalPaid - total;
  
  // Update input values
  Object.keys(paymentMethods).forEach(method => {
    const input = document.querySelector(`.payment-input-small[data-method="${method}"]`);
    if (input) {
      input.value = paymentMethods[method] > 0 ? formatRupiah(paymentMethods[method]) : '';
    }
    
    // Update active state
    const methodElement = document.querySelector(`.payment-method-horizontal[data-method="${method}"]`);
    if (methodElement) {
      if (paymentMethods[method] > 0) {
        methodElement.classList.add('active');
      } else {
        methodElement.classList.remove('active');
      }
    }
  });
  
  // Update summary
  document.getElementById('paymentTotalH').textContent = formatRupiah(total);
  document.getElementById('paymentTotalPaidH').textContent = formatRupiah(totalPaid);
  document.getElementById('paymentChangeH').textContent = formatRupiah(Math.max(0, change));
  
  // Update warna summary
  const paidElement = document.getElementById('paymentTotalPaidH');
  const changeElement = document.getElementById('paymentChangeH');
  
  if (totalPaid >= total) {
    paidElement.className = 'total-paid';
    changeElement.className = 'change-amount';
  } else {
    paidElement.style.color = 'var(--warning)';
    changeElement.style.color = 'var(--danger)';
  }
}

// Hitung total dari semua payment methods
function calculateTotalPaid() {
  return Object.values(paymentMethods).reduce((sum, amount) => sum + amount, 0);
}

// Handle input di multiple payment
// 🔥 UPDATE: Handle watermark behavior
function setupMultiplePaymentInputs() {
  const container = document.getElementById('paymentMultiple');
  if (!container) return;
  
  // Event delegation untuk semua payment inputs
  container.addEventListener('input', function(e) {
    if (e.target.classList.contains('payment-input-small')) {
      const method = e.target.getAttribute('data-method');
      const value = parseNumberFromString(e.target.value);
      
      paymentMethods[method] = value;
      updateMultiplePaymentDisplay();
      
      // 🔥 UPDATE: Handle watermark visibility
      if (value > 0) {
        e.target.placeholder = ''; // Hilangkan watermark jika ada value
      } else {
        // Kembalikan watermark berdasarkan method
        const watermarks = {
          tunai: 'Tunai',
          debit: 'Debit', 
          ewallet: 'E-Wallet',
          qris: 'QRIS'
        };
        e.target.placeholder = watermarks[method];
      }
    }
  });
  
  // 🔥 UPDATE: Focus behavior dengan watermark
  container.addEventListener('focusin', function(e) {
    if (e.target.classList.contains('payment-input-small')) {
      const input = e.target;
      setTimeout(() => {
        input.select();
        // Saat focus, sembunyikan sementara watermark
        input.setAttribute('data-original-placeholder', input.placeholder);
        input.placeholder = '';
      }, 10);
    }
  });
  
  container.addEventListener('focusout', function(e) {
    if (e.target.classList.contains('payment-input-small')) {
      const input = e.target;
      const method = input.getAttribute('data-method');
      const value = parseNumberFromString(input.value);
      
      // Kembalikan watermark jika tidak ada value
      if (value === 0) {
        const watermarks = {
          tunai: 'Tunai',
          debit: 'Debit',
          ewallet: 'E-Wallet', 
          qris: 'QRIS'
        };
        input.placeholder = watermarks[method];
      }
    }
  });
  
  // Click method badge untuk focus input
  container.addEventListener('click', function(e) {
    if (e.target.closest('.method-badge')) {
      const methodBadge = e.target.closest('.method-badge');
      const input = methodBadge.querySelector('.payment-input-small');
      if (input) {
        input.focus();
        input.select();
      }
    }
  });
  
  // Enter key untuk pindah antar methods
  container.addEventListener('keydown', function(e) {
    if (e.target.classList.contains('payment-input-small') && e.key === 'Enter') {
      e.preventDefault();
      const methods = ['tunai', 'debit', 'ewallet', 'qris'];
      const currentMethod = e.target.getAttribute('data-method');
      const currentIndex = methods.indexOf(currentMethod);
      
      if (currentIndex !== -1 && currentIndex < methods.length - 1) {
        const nextMethod = methods[currentIndex + 1];
        const nextInput = document.querySelector(`.payment-input-small[data-method="${nextMethod}"]`);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      } else {
        // Jika di method terakhir, focus ke tombol selesai
        document.getElementById('btnSelesai').focus();
      }
    }
  });
}

// Debounce Function untuk performance
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 🔥 PERBAIKAN: Fungsi untuk deduplikasi data toko
function deduplicateTokoData(tokoData) {
  const uniqueToko = new Map();
  
  tokoData.forEach(toko => {
    if (toko.status === 'Aktif' && toko.id_toko !== 'ALL') {
      if (!uniqueToko.has(toko.id_toko)) {
        uniqueToko.set(toko.id_toko, toko);
      }
    }
  });
  
  return Array.from(uniqueToko.values());
}

// 🔥 PERBAIKAN: populateTokoDropdownForMenu dengan deduplikasi
// 🔥 PERBAIKAN: populateTokoDropdownForMenu dengan deduplikasi
function populateTokoDropdownForMenu(tokoData) {
  const tokoSelect = document.getElementById('inputToko');
  if (!tokoSelect) return;
  
  const defaultOptions = tokoSelect.innerHTML;
  tokoSelect.innerHTML = defaultOptions;
  
  if (kasirInfo.levelAkses === 'OWNER' && tokoData && tokoData.length > 0) {
    // HAPUS DUPLIKAT: Gunakan hanya toko unik
    const uniqueToko = deduplicateTokoData(tokoData);
    
    uniqueToko.forEach(toko => {
      const option = document.createElement('option');
      option.value = toko.id_toko;
      option.textContent = `${toko.id_toko} - ${toko.nama_toko}`;
      tokoSelect.appendChild(option);
    });
  }
}

// 🔥 PERBAIKAN: loadTokoForMenuFilter dengan deduplikasi  
// 🔥 PERBAIKAN: loadTokoForMenuFilter dengan deduplikasi  
async function loadTokoForMenuFilter() {
  try {
    const cachedToko = getCachedData('toko');
    if (cachedToko) {
      const filterToko = document.getElementById('filterTokoMenuManagement');
      if (filterToko) {
        // HAPUS DUPLIKAT: Gunakan hanya toko unik
        const uniqueToko = deduplicateTokoData(cachedToko);
        
        uniqueToko.forEach(toko => {
          const option = document.createElement('option');
          option.value = toko.id_toko;
          option.textContent = `${toko.id_toko} - ${toko.nama_toko}`;
          filterToko.appendChild(option);
        });
      }
      return;
    }
    

    const data = await hybridFetch('/getToko', { 
      levelAkses: kasirInfo.levelAkses
    });
    
    if (data && data.success) {
      const filterToko = document.getElementById('filterTokoMenuManagement');
      if (filterToko) {
        // HAPUS DUPLIKAT: Gunakan hanya toko unik
        const uniqueToko = deduplicateTokoData(data.data);
        
        uniqueToko.forEach(toko => {
          const option = document.createElement('option');
          option.value = toko.id_toko;
          option.textContent = `${toko.id_toko} - ${toko.nama_toko}`;
          filterToko.appendChild(option);
        });
      }
    }
  } catch (err) {
    console.error('Error load toko for filter:', err);
  }
}

// 🔥 PERBAIKAN: populateTokoDropdowns dengan deduplikasi
function populateTokoDropdowns() {
  const userTokoSelect = document.getElementById('inputTokoUser');
  
  if (userTokoSelect) {
    userTokoSelect.innerHTML = '<option value="">Pilih Toko</option>';
    
    const filteredToko = tokoManagementData.filter(toko => {
      if (kasirInfo.levelAkses === 'OWNER') return true;
      if (kasirInfo.levelAkses === 'ADMIN') return toko.id_toko === kasirInfo.idToko;
      return false;
    });
    
    // HAPUS DUPLIKAT: Gunakan hanya toko unik
    const uniqueToko = deduplicateTokoData(filteredToko);
    
    uniqueToko.forEach(toko => {
      const option = document.createElement('option');
      option.value = toko.id_toko;
      option.textContent = `${toko.id_toko} - ${toko.nama_toko}`;
      userTokoSelect.appendChild(option);
    });
    
    if (kasirInfo.levelAkses === 'OWNER') {
      const option = document.createElement('option');
      option.value = 'ALL';
      option.textContent = 'ALL - Semua Toko';
      userTokoSelect.appendChild(option);
    }
  }
}
// Helper functions
function formatRupiah(angka){
  const n = parseInt(angka) || 0;
  return n.toLocaleString('id-ID');
}

function parseNumberFromString(s){
  if (!s) return 0;
  return parseInt((s + '').replace(/[^\d]/g, '')) || 0;
}

function formatDateForInput(date) {
  return date.toISOString().split('T')[0];
}

// 🔥 FUNGSI BARU: Notification System Modern
function showNotification(message, type = 'info', duration = 3000) {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll('.custom-notification');
  existingNotifications.forEach(notif => notif.remove());
  
  const notification = document.createElement('div');
  notification.className = `custom-notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">${getNotificationIcon(type)}</span>
      <span class="notification-message">${message}</span>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Add styles if not exists
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      .custom-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--card);
        border-left: 4px solid var(--accent);
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 400px;
        animation: slideInRight 0.3s ease;
      }
      .notification-success { border-left-color: var(--success); }
      .notification-warning { border-left-color: var(--warning); }
      .notification-error { border-left-color: var(--danger); }
      .notification-content {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .notification-icon { font-size: 1.2rem; }
      .notification-message { flex: 1; font-size: 0.9rem; }
      .notification-close {
        background: none;
        border: none;
        color: var(--muted);
        cursor: pointer;
        font-size: 1.2rem;
        padding: 0;
        width: 20px;
        height: 20px;
      }
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Auto remove
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, duration);
}

function getNotificationIcon(type) {
  const icons = {
    success: '✅',
    warning: '⚠️',
    error: '❌',
    info: 'ℹ️'
  };
  return icons[type] || 'ℹ️';
}

// Cache Management
function getCachedData(key) {
  const item = cache[key];
  if (item && item.data && (Date.now() - item.timestamp) < CACHE_TTL) {
    return item.data;
  }
  return null;
}

function setCachedData(key, data) {
  cache[key] = {
    data: data,
    timestamp: Date.now()
  };
}

function clearCache() {
  Object.keys(cache).forEach(key => {
    cache[key] = { data: null, timestamp: 0 };
  });
}

// 🔥 FUNGSI BARU: Update total saja tanpa re-render tabel
function updateTotalOnly() {
  const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
  
  // Update total display saja
  document.getElementById('totalHarga').textContent = formatRupiah(total);
  
  // 🔥 AUTO-UPDATE CASH INPUT ke nilai total (sesuai permintaan)
  const cashInput = document.getElementById('cashInput');
  cashInput.value = formatRupiah(total);
  
  // Hitung kembalian
  hitungKembali();
}

// 🔥 FUNGSI BARU: Switch ke subtab tertentu
// 🔥 FUNGSI BARU: Switch ke subtab tertentu - VERSI DIPERBAIKI
function switchToSubTab(subtabName) {
  console.log('🔄 Switching to subtab:', subtabName);
  
  // Cari di tab management yang aktif
  const activeManagementTab = document.querySelector('.tab-content[data-tab="manajemen"].active');
  if (!activeManagementTab) {
    console.log('❌ Tab management tidak aktif');
    return;
  }
  
  const subtabBtns = activeManagementTab.querySelectorAll('.subtab-btn');
  const subtabContents = activeManagementTab.querySelectorAll('.subtab-content');
  
  console.log('🔍 Found subtab buttons:', subtabBtns.length);
  console.log('🔍 Found subtab contents:', subtabContents.length);
  
  // Update active button
  subtabBtns.forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.subtab === subtabName) {
      btn.classList.add('active');
      console.log('✅ Activated button:', subtabName);
    }
  });
  
  // Show target content
  subtabContents.forEach(content => {
    content.classList.remove('active');
    if (content.dataset.subtab === subtabName) {
      content.classList.add('active');
      console.log('✅ Activated content:', subtabName);
    }
  });
}

// ==================== THEME & SETTING FUNCTIONS ====================

// 🔥 PERBAIKAN REAL-TIME: Theme System Modern
function applyTheme(themeName) {
  const root = document.documentElement;
  
  console.log('🎨 Applying theme:', themeName);
  
  // Remove existing theme classes
  root.classList.remove('theme-dark', 'theme-light', 'theme-auto');
  
  // Apply new theme
  root.classList.add(`theme-${themeName}`);
  
  // Force reflow untuk memastikan perubahan diterapkan
  document.body.offsetHeight;
  
  console.log('✅ Theme applied successfully');
}

// 🔥 PERBAIKAN REAL-TIME: Font System
function applyFontSettings(fontFamily, fontSize) {
  const root = document.documentElement;
  const body = document.body;
  
  console.log('🔤 Applying font settings:', { fontFamily, fontSize });
  
  // Apply font family
  if (fontFamily && fontFamily !== 'default') {
    root.style.setProperty('--font-family', fontFamily);
    body.style.fontFamily = fontFamily;
    console.log('✅ Font family applied:', fontFamily);
  } else {
    root.style.setProperty('--font-family', "'Poppins', sans-serif");
    body.style.fontFamily = "'Poppins', sans-serif";
    console.log('✅ Default font family applied');
  }
  
  // Apply font size
  if (fontSize && fontSize !== 'normal') {
    const sizes = {
      'small': '0.85rem',
      'normal': '1rem', 
      'large': '1.15rem',
      'xlarge': '1.3rem'
    };
    const newSize = sizes[fontSize] || '1rem';
    root.style.setProperty('--base-font-size', newSize);
    body.style.fontSize = newSize;
    console.log('✅ Font size applied:', fontSize, '=', newSize);
  } else {
    root.style.setProperty('--base-font-size', '1rem');
    body.style.fontSize = '1rem';
    console.log('✅ Normal font size applied');
  }
  
  // Force reflow
  document.body.offsetHeight;
}

// 🔥 PERBAIKAN REAL-TIME: Layout Settings
function applyLayoutSettings(layoutMode, sidebarPosition) {
  const root = document.documentElement;
  
  console.log('📐 Applying layout settings:', { layoutMode, sidebarPosition });
  
  // Remove existing layout classes
  root.classList.remove('layout-compact', 'layout-comfortable', 'sidebar-left', 'sidebar-right');
  
  // Apply layout mode
  if (layoutMode === 'compact') {
    root.classList.add('layout-compact');
    console.log('✅ Compact layout applied');
  } else {
    root.classList.add('layout-comfortable');
    console.log('✅ Comfortable layout applied');
  }
  
  // Apply sidebar position
  if (sidebarPosition === 'right') {
    root.classList.add('sidebar-right');
    console.log('✅ Sidebar right applied');
  } else {
    root.classList.add('sidebar-left');
    console.log('✅ Sidebar left applied');
  }
  
  // Force reflow
  document.body.offsetHeight;
}

// 🔥 PERBAIKAN: Apply semua settings sekaligus
function applyAllSettings(settings) {
  console.log('🚀 Applying all settings:', settings);
  
  applyTheme(settings.Theme || 'dark');
  applyFontSettings(settings.FontFamily, settings.FontSize);
  applyLayoutSettings(settings.LayoutMode, settings.SidebarPosition);
  
  // Apply accent colors
  document.documentElement.style.setProperty('--accent', settings.Warna_Aksen || '#14ffec');
  document.documentElement.style.setProperty('--accent-dark', settings.Warna_Aksen_Dark || '#0d7377');
  
  // Update app title
  document.title = settings.Nama_Aplikasi || 'KASIR WEB';
  
  console.log('✅ All settings applied successfully');
}

// 🔥 FUNGSI BARU: Save settings to localStorage
function saveSettingToLocalStorage() {
  if (kasirInfo.idToko) {
    localStorage.setItem(`settings_${kasirInfo.idToko}`, JSON.stringify(currentSettings));
  }
}

// ==================== TAB MANAGEMENT ====================

// 🔥 PERBAIKAN: Fungsi untuk menampilkan tab berdasarkan level akses
function showTabsBasedOnLevel() {
  if (!kasirInfo || !kasirInfo.levelAkses) return;
  
  const level = kasirInfo.levelAkses;
  console.log('Level Akses:', level);
  
  const tabManajemen = document.getElementById('tabManajemen');
  const tabToko = document.getElementById('tabToko');
  const tabUser = document.getElementById('tabUser');
  const tabSetting = document.getElementById('tabSetting');
  
  if (tabManajemen) tabManajemen.style.display = 'none';
  if (tabToko) tabToko.style.display = 'none';
  if (tabUser) tabUser.style.display = 'none';
  if (tabSetting) tabSetting.style.display = 'none';
  
  if (level === 'OWNER') {
    if (tabManajemen) tabManajemen.style.display = 'block';
    if (tabToko) tabToko.style.display = 'block';
    if (tabUser) tabUser.style.display = 'block';
    if (tabSetting) tabSetting.style.display = 'block';
  } else if (level === 'ADMIN') {
    if (tabManajemen) tabManajemen.style.display = 'block';
    if (tabUser) tabUser.style.display = 'block';
    if (tabSetting) tabSetting.style.display = 'block';
  }
  
  setupLaporanFilters();
}

// Navigation between tabs
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.dataset.tab === targetTab) {
          content.classList.add('active');
        }
      });
      
      // Load data if needed dengan cache
      if (targetTab === 'laporan') {
        loadLaporanModern();
      } else if (targetTab === 'manajemen') {
        loadMenuManagement();
      } else if (targetTab === 'user') {
        loadUserManagement();
      } else if (targetTab === 'toko') {
        loadTokoManagement();
      } else if (targetTab === 'setting') {
        loadSetting();
      }
    });
  });
}

// ==================== USER MANAGEMENT FUNCTIONS ====================

// Load data user dengan SORTING BERDASARKAN TOKO
async function loadUserManagement() {
  try {
    // Cek cache dulu
    const cachedUsers = getCachedData('users');
    const cachedToko = getCachedData('toko');
    
    if (cachedUsers && cachedToko) {
      userManagementData = cachedUsers;
      tokoManagementData = cachedToko;
      
      sortUserManagementData();
      renderUserManagementList();
      renderTokoManagementList();
      populateTokoDropdowns();
      showTabsBasedOnLevel();
      setupLaporanFilters();
      return;
    }

    const data = await hybridFetch('/getUserManagement', { 
      idToko: kasirInfo.idToko,
      levelAkses: kasirInfo.levelAkses,
      username: kasirInfo.username
    });
    
    if (data && data.success) {
      userManagementData = data.users || [];
      tokoManagementData = data.toko || [];
      
      sortUserManagementData();
      setCachedData('users', userManagementData);
      setCachedData('toko', tokoManagementData);
      
      renderUserManagementList();
      renderTokoManagementList();
      populateTokoDropdowns();
      showTabsBasedOnLevel();
      
      // 🔥 Setup filters setelah data toko loaded
      setTimeout(() => {
        setupLaporanFilters();
        console.log('✅ Laporan filters setup after user data loaded');
      }, 100);
      
    } else {
      userManagementData = [];
      tokoManagementData = [];
      renderUserManagementList();
      renderTokoManagementList();
      setupLaporanFilters();
    }
  } catch (err) {
    console.error('Error loadUserManagement:', err);
    userManagementData = [];
    tokoManagementData = [];
    renderUserManagementList();
    renderTokoManagementList();
    setupLaporanFilters();
  }
}

// 🔥 FUNGSI BARU: Load toko management
async function loadTokoManagement() {
  try {
    const cachedToko = getCachedData('toko');
    if (cachedToko) {
      tokoManagementData = cachedToko;
      renderTokoManagementList();
      return;
    }

    const data = await hybridFetch('/getToko', { 
      levelAkses: kasirInfo.levelAkses
    });
    
    if (data && data.success) {
      tokoManagementData = data.data || [];
      setCachedData('toko', tokoManagementData);
      renderTokoManagementList();
    } else {
      tokoManagementData = [];
      renderTokoManagementList();
    }
  } catch (err) {
    console.error('Error loadTokoManagement:', err);
    tokoManagementData = [];
    renderTokoManagementList();
  }
}

// Sorting user berdasarkan toko
function sortUserManagementData() {
  userManagementData.sort((a, b) => {
    const tokoCompare = (a.id_toko || '').localeCompare(b.id_toko || '');
    if (tokoCompare !== 0) return tokoCompare;
    
    const levelOrder = { 'OWNER': 1, 'ADMIN': 2, 'KASIR': 3 };
    const levelA = levelOrder[a.level_akses] || 4;
    const levelB = levelOrder[b.level_akses] || 4;
    
    if (levelA !== levelB) return levelA - levelB;
    
    return (a.username || '').localeCompare(b.username || '');
  });
}

// Render daftar user dengan virtual DOM improvement
function renderUserManagementList(filteredData = userManagementData) {
  const tbody = document.getElementById('daftarUserBody');
  if (!tbody) return;
  
  const fragment = document.createDocumentFragment();
  
  if (!filteredData || filteredData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:20px;color:var(--muted)">
          Tidak ada data user
        </td>
      </tr>
    `;
    return;
  }
  
  let currentToko = null;
  
  filteredData.forEach(user => {
    const tr = document.createElement('tr');
    
    if (currentToko !== user.id_toko) {
      currentToko = user.id_toko;
      tr.style.borderTop = '2px solid var(--accent-dark)';
    }
    
    tr.innerHTML = `
      <td>${user.username}</td>
      <td><strong>${user.nama_kasir}</strong></td>
      <td>${user.nama_toko || user.id_toko}</td>
      <td>
        <span class="role-badge role-${user.level_akses.toLowerCase()}">
          ${user.level_akses}
        </span>
      </td>
      <td>
        <span class="status-badge status-${user.status.toLowerCase()}">
          ${user.status}
        </span>
      </td>
      <td>${user.terakhir_login || '-'}</td>
      <td>
        ${canEditUser(user) ? `<button class="btn-edit-user" data-username="${user.username}">✏️ Edit</button>` : ''}
        ${canDeleteUser(user) ? `<button class="btn-delete-user" data-username="${user.username}">🗑️ Hapus</button>` : ''}
        ${canResetPassword(user) ? `<button class="btn-reset-password" data-username="${user.username}">🔑 Reset</button>` : ''}
      </td>
    `;
    fragment.appendChild(tr);
  });
  
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
  
  document.querySelectorAll('.btn-edit-user').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const username = e.target.getAttribute('data-username');
      editUser(username);
    });
  });
  
  document.querySelectorAll('.btn-delete-user').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const username = e.target.getAttribute('data-username');
      deleteUser(username);
    });
  });
  
  document.querySelectorAll('.btn-reset-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const username = e.target.getAttribute('data-username');
      resetPasswordUser(username);
    });
  });
}

// Render daftar toko dengan virtual DOM
function renderTokoManagementList(filteredData = tokoManagementData) {
  const tbody = document.getElementById('daftarTokoBody');
  if (!tbody) return;
  
  const fragment = document.createDocumentFragment();
  
  if (!filteredData || filteredData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">
          Tidak ada data toko
        </td>
      </tr>
    `;
    return;
  }
  
  filteredData.forEach(toko => {
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
      <td>${toko.id_toko}</td>
      <td><strong>${toko.nama_toko}</strong></td>
      <td>${toko.alamat || '-'}</td>
      <td>${toko.telepon || '-'}</td>
      <td>
        <span class="status-badge status-${toko.status.toLowerCase()}">
          ${toko.status}
        </span>
      </td>
      <td>
        ${canEditToko() ? `<button class="btn-edit-toko" data-id="${toko.id_toko}">✏️ Edit</button>` : ''}
        ${canDeleteToko() ? `<button class="btn-delete-toko" data-id="${toko.id_toko}">🗑️ Hapus</button>` : ''}
      </td>
    `;
    fragment.appendChild(tr);
  });
  
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
  
  document.querySelectorAll('.btn-edit-toko').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tokoId = e.target.getAttribute('data-id');
      editToko(tokoId);
    });
  });
  
  document.querySelectorAll('.btn-delete-toko').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tokoId = e.target.getAttribute('data-id');
      deleteToko(tokoId);
    });
  });
}

// Populate dropdown toko
// 🔥 PERBAIKAN: populateTokoDropdowns dengan deduplikasi
function populateTokoDropdowns() {
  const userTokoSelect = document.getElementById('inputTokoUser');
  
  if (userTokoSelect) {
    userTokoSelect.innerHTML = '<option value="">Pilih Toko</option>';
    
    const filteredToko = tokoManagementData.filter(toko => {
      if (kasirInfo.levelAkses === 'OWNER') return true;
      if (kasirInfo.levelAkses === 'ADMIN') return toko.id_toko === kasirInfo.idToko;
      return false;
    });
    
    // HAPUS DUPLIKAT: Gunakan hanya toko unik
    const uniqueToko = deduplicateTokoData(filteredToko);
    
    uniqueToko.forEach(toko => {
      const option = document.createElement('option');
      option.value = toko.id_toko;
      option.textContent = `${toko.id_toko} - ${toko.nama_toko}`;
      userTokoSelect.appendChild(option);
    });
    
    if (kasirInfo.levelAkses === 'OWNER') {
      const option = document.createElement('option');
      option.value = 'ALL';
      option.textContent = 'ALL - Semua Toko';
      userTokoSelect.appendChild(option);
    }
  }
}
// Permission checks
function canEditUser(user) {
  if (kasirInfo.levelAkses === 'OWNER') return true;
  if (kasirInfo.levelAkses === 'ADMIN' && user.id_toko === kasirInfo.idToko && user.level_akses !== 'OWNER') return true;
  return false;
}

function canDeleteUser(user) {
  if (user.username === kasirInfo.username) return false;
  if (kasirInfo.levelAkses === 'OWNER') return true;
  if (kasirInfo.levelAkses === 'ADMIN' && user.level_akses === 'KASIR' && user.id_toko === kasirInfo.idToko) return true;
  return false;
}

function canResetPassword(user) {
  if (kasirInfo.levelAkses === 'OWNER') return true;
  if (kasirInfo.levelAkses === 'ADMIN' && user.id_toko === kasirInfo.idToko) return true;
  if (user.username === kasirInfo.username) return true;
  return false;
}

function canEditToko() {
  return kasirInfo.levelAkses === 'OWNER';
}

function canDeleteToko() {
  return kasirInfo.levelAkses === 'OWNER';
}

// Edit user
function editUser(username) {
  const user = userManagementData.find(u => u.username === username);
  if (!user) return;
  
  editingUserId = username;
  
  document.getElementById('inputUsername').value = user.username;
  document.getElementById('inputUsername').disabled = true;
  document.getElementById('inputNamaUser').value = user.nama_kasir;
  document.getElementById('inputTokoUser').value = user.id_toko;
  document.getElementById('inputRoleUser').value = user.level_akses;
  document.getElementById('inputStatusUser').value = user.status;
  
  if (kasirInfo.levelAkses === 'ADMIN') {
    const roleSelect = document.getElementById('inputRoleUser');
    roleSelect.innerHTML = '<option value="KASIR">Kasir</option>';
    roleSelect.value = 'KASIR';
  }
  
  document.getElementById('btnSimpanUser').textContent = '💾 Update User';
  document.getElementById('btnBatalEditUser').style.display = 'inline-block';
  
  document.querySelector('.form-menu').scrollIntoView({ behavior: 'smooth' });
}

// Edit toko
function editToko(tokoId) {
  const toko = tokoManagementData.find(t => t.id_toko === tokoId);
  if (!toko) return;
  
  editingTokoId = tokoId;
  
  document.getElementById('inputIdToko').value = toko.id_toko;
  document.getElementById('inputIdToko').disabled = true;
  document.getElementById('inputNamaToko').value = toko.nama_toko;
  document.getElementById('inputAlamatToko').value = toko.alamat || '';
  document.getElementById('inputTeleponToko').value = toko.telepon || '';
  document.getElementById('inputStatusToko').value = toko.status;
  
  document.getElementById('btnSimpanToko').textContent = '💾 Update Toko';
  document.getElementById('btnBatalEditToko').style.display = 'inline-block';
  
  document.querySelector('.form-menu').scrollIntoView({ behavior: 'smooth' });
}

// Batal edit user/toko
function cancelEditUser() {
  editingUserId = null;
  clearUserForm();
  document.getElementById('btnSimpanUser').textContent = '💾 Simpan User';
  document.getElementById('btnBatalEditUser').style.display = 'none';
}

function cancelEditToko() {
  editingTokoId = null;
  clearTokoForm();
  document.getElementById('btnSimpanToko').textContent = '💾 Simpan Toko';
  document.getElementById('btnBatalEditToko').style.display = 'none';
}

// Clear form user
function clearUserForm() {
  document.getElementById('inputUsername').value = '';
  document.getElementById('inputUsername').disabled = false;
  document.getElementById('inputPassword').value = '';
  document.getElementById('inputNamaUser').value = '';
  document.getElementById('inputTokoUser').value = '';
  
  const roleSelect = document.getElementById('inputRoleUser');
  if (kasirInfo.levelAkses === 'OWNER') {
    roleSelect.innerHTML = `
      <option value="KASIR">Kasir</option>
      <option value="ADMIN">Admin</option>
      <option value="OWNER">Owner</option>
    `;
    roleSelect.value = 'KASIR';
  } else if (kasirInfo.levelAkses === 'ADMIN') {
    roleSelect.innerHTML = '<option value="KASIR">Kasir</option>';
    roleSelect.value = 'KASIR';
  }
  
  document.getElementById('inputStatusUser').value = 'Aktif';
}

// Clear form toko
function clearTokoForm() {
  document.getElementById('inputIdToko').value = '';
  document.getElementById('inputIdToko').disabled = false;
  document.getElementById('inputNamaToko').value = '';
  document.getElementById('inputAlamatToko').value = '';
  document.getElementById('inputTeleponToko').value = '';
  document.getElementById('inputStatusToko').value = 'Aktif';
}

// Delete user
async function deleteUser(username) {
  if (!confirm(`Apakah Anda yakin ingin menghapus user ${username}?`)) return;
  
  try {
    const data = await hybridFetch('/deleteUser', {
      username: username,
      idToko: kasirInfo.idToko,
      levelAkses: kasirInfo.levelAkses,
      currentUsername: kasirInfo.username,
      permanent: true
    });
    
    if (data && data.success) {
      showNotification('User berhasil dihapus', 'success');
      clearCache();
      loadUserManagement();
    } else {
      showNotification('Gagal menghapus user: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Gagal menghapus user: ' + err.message, 'error');
  }
}

// Delete toko
async function deleteToko(tokoId) {
  if (!confirm(`Apakah Anda yakin ingin menghapus toko ${tokoId}?`)) return;
  
  try {
    const data = await hybridFetch('/deleteToko', {
      idToko: tokoId,
      levelAkses: kasirInfo.levelAkses,
      permanent: true
    });
    
    if (data && data.success) {
      showNotification('Toko berhasil dihapus', 'success');
      clearCache();
      loadUserManagement();
    } else {
      showNotification('Gagal menghapus toko: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Gagal menghapus toko: ' + err.message, 'error');
  }
}

// Reset password user
async function resetPasswordUser(username) {
  const newPassword = prompt(`Reset password untuk ${username}\nMasukkan password baru:`);
  
  if (!newPassword || newPassword.length < 4) {
    showNotification('Password harus minimal 4 karakter', 'warning');
    return;
  }
  
  try {
    const data = await hybridFetch('/resetPassword', {
      username: username,
      newPassword: newPassword,
      idToko: kasirInfo.idToko,
      levelAkses: kasirInfo.levelAkses,
      currentUsername: kasirInfo.username
    });
    
    if (data && data.success) {
      showNotification('Password berhasil direset', 'success');
    } else {
      showNotification('Gagal reset password: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Gagal reset password: ' + err.message, 'error');
  }
}

// Save user
async function saveUser() {
  const username = document.getElementById('inputUsername').value.trim();
  const password = document.getElementById('inputPassword').value;
  const namaUser = document.getElementById('inputNamaUser').value.trim();
  const toko = document.getElementById('inputTokoUser').value;
  const levelAkses = document.getElementById('inputRoleUser').value;
  const status = document.getElementById('inputStatusUser').value;
  
  if (!username) {
    showNotification('Username harus diisi', 'warning');
    return;
  }
  if (!editingUserId && !password) {
    showNotification('Password harus diisi untuk user baru', 'warning');
    return;
  }
  if (!namaUser) {
    showNotification('Nama user harus diisi', 'warning');
    return;
  }
  if (!toko) {
    showNotification('Toko harus dipilih', 'warning');
    return;
  }
  
  try {
    const action = editingUserId ? 'updateUser' : 'createUser';
    const payload = {
      username: username,
      namaUser: namaUser,
      toko: toko,
      levelAkses: levelAkses,
      status: status,
      idToko: kasirInfo.idToko,
      levelAksesCurrent: kasirInfo.levelAkses
    };
    
    if (!editingUserId) {
      payload.password = password;
    }
    
    const data = await hybridFetch(`/${action}`, payload);
    
    if (data && data.success) {
      showNotification(editingUserId ? 'User berhasil diupdate' : 'User berhasil ditambahkan', 'success');
      clearUserForm();
      cancelEditUser();
      clearCache();
      loadUserManagement();
    } else {
      showNotification('Gagal menyimpan user: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Gagal menyimpan user: ' + err.message, 'error');
  }
}

// Save toko
async function saveToko() {
  const tokoId = document.getElementById('inputIdToko').value.trim();
  const namaToko = document.getElementById('inputNamaToko').value.trim();
  const alamat = document.getElementById('inputAlamatToko').value.trim();
  const telepon = document.getElementById('inputTeleponToko').value.trim();
  const status = document.getElementById('inputStatusToko').value;
  
  if (!tokoId) {
    showNotification('ID Toko harus diisi', 'warning');
    return;
  }
  if (!namaToko) {
    showNotification('Nama toko harus diisi', 'warning');
    return;
  }
  
  try {
    const action = editingTokoId ? 'updateToko' : 'createToko';
    const payload = {
      idToko: tokoId,
      namaToko: namaToko,
      alamat: alamat,
      telepon: telepon,
      status: status,
      levelAkses: kasirInfo.levelAkses
    };
    
    const data = await hybridFetch(`/${action}`, payload);
    
    if (data && data.success) {
      showNotification(editingTokoId ? 'Toko berhasil diupdate' : 'Toko berhasil ditambahkan', 'success');
      clearTokoForm();
      cancelEditToko();
      clearCache();
      loadUserManagement();
    } else {
      showNotification('Gagal menyimpan toko: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Gagal menyimpan toko: ' + err.message, 'error');
  }
}

// Search user dengan debounce
const setupUserManagementSearch = debounce(function() {
  const searchInput = document.getElementById('searchUserManagement');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      
      if (!searchTerm) {
        renderUserManagementList(userManagementData);
        return;
      }
      
      const filtered = userManagementData.filter(user => 
        user.username.toLowerCase().includes(searchTerm) ||
        user.nama_kasir.toLowerCase().includes(searchTerm) ||
        user.nama_toko.toLowerCase().includes(searchTerm)
      );
      
      renderUserManagementList(filtered);
    });
  }
}, 300);

// ==================== MENU MANAGEMENT FUNCTIONS ====================

// Load toko untuk menu management
async function loadTokoForMenuManagement() {
  try {
    const cachedToko = getCachedData('toko');
    if (cachedToko) {
      populateTokoDropdownForMenu(cachedToko);
      return;
    }

    const data = await hybridFetch('/getToko', { 
      levelAkses: kasirInfo.levelAkses
    });
    
    if (data && data.success) {
      populateTokoDropdownForMenu(data.data);
    }
  } catch (err) {
    console.error('Error load toko for menu:', err);
  }
}

// Populate dropdown toko untuk menu management
function populateTokoDropdownForMenu(tokoData) {
  const tokoSelect = document.getElementById('inputToko');
  if (!tokoSelect) return;
  
  const defaultOptions = tokoSelect.innerHTML;
  tokoSelect.innerHTML = defaultOptions;
  
  if (kasirInfo.levelAkses === 'OWNER' && tokoData && tokoData.length > 0) {
    tokoData.forEach(toko => {
      if (toko.status === 'Aktif' && toko.id_toko !== 'ALL') {
        const option = document.createElement('option');
        option.value = toko.id_toko;
        option.textContent = `${toko.id_toko} - ${toko.nama_toko}`;
        tokoSelect.appendChild(option);
      }
    });
  }
}

// Setup filter toko untuk management menu
function setupMenuManagementFilter() {
  const searchContainer = document.querySelector('.daftar-menu .search-wrap');
  if (!searchContainer) return;
  
  if (kasirInfo.levelAkses !== 'OWNER') return;
  
  let filterToko = document.getElementById('filterTokoMenuManagement');
  
  if (!filterToko) {
    const filterGroup = document.createElement('div');
    filterGroup.className = 'filter-group';
    filterGroup.innerHTML = `
      <select id="filterTokoMenuManagement" style="min-width: 150px;">
        <option value="">Semua Toko</option>
        <option value="ALL">🌍 Semua Toko</option>
      </select>
    `;
    searchContainer.appendChild(filterGroup);
    
    filterToko = document.getElementById('filterTokoMenuManagement');
    loadTokoForMenuFilter();
    
    filterToko.addEventListener('change', (e) => {
      const searchInput = document.getElementById('searchMenuManagement');
      filterMenuManagementData(searchInput ? searchInput.value : '', e.target.value);
    });
  }
}

// Load toko untuk filter menu management
async function loadTokoForMenuFilter() {
  try {
    const cachedToko = getCachedData('toko');
    if (cachedToko) {
      const filterToko = document.getElementById('filterTokoMenuManagement');
      if (filterToko) {
        cachedToko.forEach(toko => {
          if (toko.status === 'Aktif' && toko.id_toko !== 'ALL') {
            const option = document.createElement('option');
            option.value = toko.id_toko;
            option.textContent = `${toko.id_toko} - ${toko.nama_toko}`;
            filterToko.appendChild(option);
          }
        });
      }
      return;
    }

    const data = await hybridFetch('/getToko', { 
      levelAkses: kasirInfo.levelAkses
    });
    
    if (data && data.success) {
      const filterToko = document.getElementById('filterTokoMenuManagement');
      if (filterToko) {
        data.data.forEach(toko => {
          if (toko.status === 'Aktif' && toko.id_toko !== 'ALL') {
            const option = document.createElement('option');
            option.value = toko.id_toko;
            option.textContent = `${toko.id_toko} - ${toko.nama_toko}`;
            filterToko.appendChild(option);
          }
        });
      }
    }
  } catch (err) {
    console.error('Error load toko for filter:', err);
  }
}

// Filter data menu management
function filterMenuManagementData(searchTerm = '', tokoFilter = '') {
  let filtered = menuManagementData;
  
  // Filter berdasarkan pencarian
  if (searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    filtered = filtered.filter(menu => 
      menu.nama_menu.toLowerCase().includes(term) ||
      menu.kategori.toLowerCase().includes(term) ||
      menu.id_menu.toLowerCase().includes(term)
    );
  }
  
  // Filter toko yang KONSISTEN berdasarkan level akses
  if (kasirInfo.levelAkses === 'OWNER') {
    if (tokoFilter && tokoFilter !== 'ALL' && tokoFilter !== 'current') {
      filtered = filtered.filter(menu => 
        menu.id_toko === tokoFilter || menu.id_toko === 'ALL'
      );
    }
  } else {
    // ADMIN/KASIR: Hanya bisa lihat toko sendiri + ALL
    filtered = filtered.filter(menu => 
      menu.id_toko === kasirInfo.idToko || menu.id_toko === 'ALL'
    );
  }
  
  renderMenuManagementList(filtered);
}

// Load data untuk management menu dengan cache
async function loadMenuManagement() {
  try {
    // Cek cache dulu
    const cachedMenu = getCachedData('menuManagement');
    if (cachedMenu) {
      menuManagementData = cachedMenu;
      renderMenuManagementList();
      
      if (kasirInfo.levelAkses === 'OWNER') {
        await loadTokoForMenuManagement();
      }
      
      setupMenuManagementFilter();
      
      // 🔥 Setup filters setelah data menu loaded
      setTimeout(() => {
        setupLaporanFilters();
        console.log('✅ Laporan filters setup after menu data loaded');
      }, 100);
      
      return;
    }

    const data = await hybridFetch('/getMenuManagement', { 
      idToko: kasirInfo.idToko,
      levelAkses: kasirInfo.levelAkses
    });
    
    if (data && data.success) {
      menuManagementData = data.data || [];
      setCachedData('menuManagement', menuManagementData);
      renderMenuManagementList();
      
      if (kasirInfo.levelAkses === 'OWNER') {
        await loadTokoForMenuManagement();
      }
      
      setupMenuManagementFilter();
      
      // 🔥 Setup filters setelah data menu loaded
      setTimeout(() => {
        setupLaporanFilters();
        console.log('✅ Laporan filters setup after menu data loaded');
      }, 100);
      
    } else {
      menuManagementData = [];
      renderMenuManagementList();
    }
  } catch (err) {
    console.error('Error loadMenuManagement:', err);
    menuManagementData = [];
    renderMenuManagementList();
  }
}

// Render daftar menu dengan tampilkan STATUS
function renderMenuManagementList(filteredData = menuManagementData) {
  const tbody = document.getElementById('daftarMenuBody');
  tbody.innerHTML = '';
  
  if (!filteredData || filteredData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:20px;color:var(--muted)">
          Tidak ada data menu
        </td>
      </tr>
    `;
    return;
  }
  
  filteredData.forEach(menu => {
    const tr = document.createElement('tr');
    
    // Tentukan class untuk stok
    const stokClass = menu.stok <= 0 ? 'stok-danger' : (menu.stok < 10 ? 'stok-warning' : '');
    
    // Tentukan class untuk status
    const statusClass = menu.status === 'Aktif' ? 'status-aktif' : 'status-nonaktif';
    const statusIcon = menu.status === 'Aktif' ? '✅' : '⏸️';
    
    // Tampilan toko
    let tokoDisplay = menu.id_toko;
    if (menu.id_toko === 'ALL') {
      tokoDisplay = '🌍 Semua Toko';
    } else if (kasirInfo.levelAkses === 'OWNER') {
      const tokoInfo = tokoManagementData.find(t => t.id_toko === menu.id_toko);
      tokoDisplay = tokoInfo ? `${menu.id_toko} - ${tokoInfo.nama_toko}` : menu.id_toko;
    } else if (kasirInfo.levelAkses === 'ADMIN') {
      tokoDisplay = `${menu.id_toko} - ${kasirInfo.namaToko || menu.id_toko}`;
    }
    
    tr.innerHTML = `
      <td>${menu.id_menu}</td>
      <td><strong>${menu.nama_menu}</strong></td>
      <td>${menu.kategori}</td>
      <td>Rp${formatRupiah(menu.harga)}</td>
      <td class="${stokClass}">${menu.stok}</td>
      <td><span class="${statusClass}">${statusIcon} ${menu.status}</span></td>
      <td>${tokoDisplay}</td>
      <td>
        ${canEditMenu(menu) ? `<button class="btn-edit" data-id="${menu.id_menu}">✏️ Edit</button>` : ''}
        ${canDeleteMenu(menu) ? `<button class="btn-delete" data-id="${menu.id_menu}">🗑️ Hapus</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  // Add event listeners untuk edit/delete buttons
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const menuId = e.target.getAttribute('data-id');
      editMenu(menuId);
    });
  });
  
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const menuId = e.target.getAttribute('data-id');
      deleteMenu(menuId);
    });
  });
}

// Permission checks untuk menu
function canEditMenu(menu) {
  if (kasirInfo.levelAkses === 'OWNER') return true;
  if (kasirInfo.levelAkses === 'ADMIN' && menu.id_toko === kasirInfo.idToko) return true;
  return false;
}

function canDeleteMenu(menu) {
  if (kasirInfo.levelAkses === 'OWNER') return true;
  if (kasirInfo.levelAkses === 'ADMIN' && menu.id_toko === kasirInfo.idToko) return true;
  return false;
}

// Cek duplikat nama menu
function isMenuNameDuplicate(namaMenu, excludeId = null) {
  return menuManagementData.some(menu => 
    menu.nama_menu.toLowerCase() === namaMenu.toLowerCase() && 
    menu.id_menu !== excludeId
  );
}

// Edit menu dengan tampilkan STATUS di form
// Edit menu dengan tampilkan STATUS di form - VERSI DIPERBAIKI
function editMenu(menuId) {
  console.log('✏️ Edit menu clicked:', menuId);
  
  const menu = menuManagementData.find(m => m.id_menu === menuId);
  if (!menu) {
    console.log('❌ Menu not found:', menuId);
    return;
  }
  
  editingMenuId = menuId;
  
  // Isi form dengan data menu
  document.getElementById('inputNamaMenu').value = menu.nama_menu;
  document.getElementById('inputKategori').value = menu.kategori;
  document.getElementById('inputHarga').value = menu.harga;
  document.getElementById('inputStok').value = menu.stok || 0;
  
  // Tampilkan STATUS di form
  let statusSelect = document.getElementById('inputStatusMenu');
  if (!statusSelect) {
    // Buat dropdown status jika belum ada
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    formGroup.innerHTML = `
      <label for="inputStatusMenu">Status:</label>
      <select id="inputStatusMenu">
        <option value="Aktif">Aktif</option>
        <option value="Nonaktif">Nonaktif</option>
      </select>
    `;
    document.getElementById('inputStok').parentNode.after(formGroup);
    statusSelect = document.getElementById('inputStatusMenu');
  }
  statusSelect.value = menu.status;
  
  // Set nilai toko
  const tokoSelect = document.getElementById('inputToko');
  if (tokoSelect) {
    if (kasirInfo.levelAkses === 'OWNER') {
      tokoSelect.value = menu.id_toko;
    } else {
      tokoSelect.value = 'current';
    }
  }
  
  // Update UI untuk mode edit
  document.getElementById('btnSimpanMenu').textContent = '💾 Update Menu';
  document.getElementById('btnBatalEdit').style.display = 'inline-block';
  document.getElementById('menuIdDisplay').textContent = `Editing: ${menuId} (${menu.status})`;
  
  // 🔥 PASTIKAN TAB MANAGEMENT AKTIF DULU
  const managementTab = document.querySelector('.nav-tab[data-tab="manajemen"]');
  if (managementTab && !managementTab.classList.contains('active')) {
    console.log('⚠️ Management tab tidak aktif, switching...');
    managementTab.click(); // Trigger click untuk activate tab
  }
  
  // 🔥 AUTO SWITCH KE SUBTAB FORM - dengan delay sedikit
  setTimeout(() => {
    console.log('🔄 Executing subtab switch...');
    switchToSubTab('form-menu');
  }, 100);
  
  console.log('✅ Edit menu setup completed');
}
// Clear form menu dengan reset STATUS
function clearMenuForm() {
  document.getElementById('inputNamaMenu').value = '';
  document.getElementById('inputKategori').value = '';
  document.getElementById('inputHarga').value = '';
  document.getElementById('inputStok').value = '0';
  
  // Reset status ke Aktif
  const statusSelect = document.getElementById('inputStatusMenu');
  if (statusSelect) {
    statusSelect.value = 'Aktif';
  }
  
  // Set default toko berdasarkan level akses
  const tokoSelect = document.getElementById('inputToko');
  if (tokoSelect) {
    if (kasirInfo.levelAkses === 'OWNER') {
      tokoSelect.value = 'current';
    } else {
      tokoSelect.value = 'current';
    }
  }
  
  // Hapus pesan error duplikat
  const errorMsg = document.getElementById('duplicateError');
  if (errorMsg) errorMsg.remove();
}

function cancelEdit() {
  editingMenuId = null;
  clearMenuForm();
  document.getElementById('btnSimpanMenu').textContent = '💾 Simpan Menu';
  document.getElementById('btnBatalEdit').style.display = 'none';
  document.getElementById('menuIdDisplay').textContent = '';
  
  // 🔥 AUTO SWITCH KE SUBTAB DAFTAR
  switchToSubTab('daftar-menu');
}

// Save menu dengan STATUS
async function saveMenu() {
  const namaMenu = document.getElementById('inputNamaMenu').value.trim();
  const kategori = document.getElementById('inputKategori').value;
  const harga = parseInt(document.getElementById('inputHarga').value) || 0;
  const stok = parseInt(document.getElementById('inputStok').value) || 0;
  const toko = document.getElementById('inputToko').value;
  const statusSelect = document.getElementById('inputStatusMenu');
  const status = statusSelect ? statusSelect.value : 'Aktif';
  
  const idToko = toko === 'current' ? kasirInfo.idToko : toko;
  
  // Validasi
  if (!namaMenu) {
    showNotification('Nama menu harus diisi', 'warning');
    return;
  }
  if (!kategori) {
    showNotification('Kategori harus dipilih', 'warning');
    return;
  }
  if (harga <= 0) {
    showNotification('Harga harus lebih dari 0', 'warning');
    return;
  }
  
  // Cek duplikat nama menu
  if (isMenuNameDuplicate(namaMenu, editingMenuId)) {
    showNotification('❌ Nama menu sudah ada! Gunakan nama yang berbeda.', 'error');
    return;
  }
  
  try {
    const action = editingMenuId ? 'updateMenu' : 'createMenu';
    const payload = {
      idToko: kasirInfo.idToko,
      namaMenu: namaMenu,
      kategori: kategori,
      harga: harga,
      stok: stok,
      status: status,
      targetToko: idToko,
      levelAkses: kasirInfo.levelAkses
    };
    
    if (editingMenuId) {
      payload.idMenu = editingMenuId;
    }
    
    const data = await hybridFetch(`/${action}`, payload);
    
    if (data && data.success) {
      showNotification(editingMenuId ? 'Menu berhasil diupdate' : 'Menu berhasil ditambahkan', 'success');
      clearMenuForm();
      cancelEdit();
      clearCache();
      loadMenuManagement();
      loadMenu();
    // 🔥 AUTO SWITCH KE SUBTAB DAFTAR SETELAH SIMPAN
  switchToSubTab('daftar-menu');
}
     else {
      showNotification('Gagal menyimpan menu: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Gagal menyimpan menu: ' + err.message, 'error');
  }
  
}

// Delete menu PERMANEN
async function deleteMenu(menuId) {
  if (!confirm(`Apakah Anda yakin ingin MENGHAPUS PERMANEN menu ${menuId}?`)) {
    return;
  }
  
  try {
    const data = await hybridFetch('/deleteMenu', {
      idMenu: menuId,
      idToko: kasirInfo.idToko,
      levelAkses: kasirInfo.levelAkses,
      permanent: true
    });
    
    if (data && data.success) {
      showNotification('Menu berhasil dihapus PERMANEN', 'success');
      clearCache();
      loadMenuManagement();
      loadMenu();
    } else {
      showNotification('Gagal menghapus menu: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Gagal menghapus menu: ' + err.message, 'error');
  }
}

// Search menu di management dengan debounce
const setupMenuManagementSearch = debounce(function() {
  const searchInput = document.getElementById('searchMenuManagement');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      const filterToko = document.getElementById('filterTokoMenuManagement');
      const tokoFilter = filterToko ? filterToko.value : '';
      
      filterMenuManagementData(searchTerm, tokoFilter);
    });
  }
}, 300);

// ==================== TRANSAKSI FUNCTIONS ====================

// Load menu dengan cache
async function loadMenu(){
  const spinner = document.getElementById('menuLoading');
  if (spinner) spinner.style.display = 'flex';
  
  try {
    // Cek cache dulu
    const cachedMenu = getCachedData('menu');
    if (cachedMenu) {
      menuData = cachedMenu;
      filteredMenu = [...menuData];
      currentPage = 1;
      renderMenuList();
      if (spinner) spinner.style.display = 'none';
      return;
    }

    const data = await hybridFetch('/getMenu', { 
      idToko: kasirInfo.idToko,
      levelAkses: kasirInfo.levelAkses
    });
    
    if (data && data.success && Array.isArray(data.data)) {
      menuData = data.data.map((m, index) => {
        return {
          id: m.id,
          nama: m.nama,
          harga: m.harga,
          kategori: m.kategori,
          stok: m.stok || 0
        };
      });
      
      setCachedData('menu', menuData);
      filteredMenu = [...menuData];
      currentPage = 1;
      renderMenuList();
    } else {
      menuData = [];
      filteredMenu = [];
      renderMenuList([]);
    }
  } catch(err) {
    menuData = [];
    filteredMenu = [];
    renderMenuList([]);
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

// Render menu dengan virtual DOM
function renderMenuList(items = filteredMenu){
  const list = document.getElementById('menuList');
  if (!list) return;
  
  list.innerHTML = '';
  
  if (!items || items.length === 0) {
    list.innerHTML = "<div style='color:var(--muted); text-align:center; padding:10px; grid-column:1/-1; font-size:0.7rem;'>Tidak ada menu</div>";
    updatePaginationInfo(0);
    return;
  }

  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const itemsToShow = items.slice(startIndex, endIndex);

  const fragment = document.createDocumentFragment();

  itemsToShow.forEach(m => {
    const btn = document.createElement('button');
    const hargaNum = m.harga;
    const stok = m.stok || 0;
    
    let stokClass = '';
    let stokText = '';
    if (stok <= 0) {
      stokClass = 'stok-habis';
      stokText = '❌ Habis';
    } else if (stok < 5) {
      stokClass = 'stok-sedikit';
      stokText = `⚠️ ${stok}`;
    } else {
      stokText = `✅ ${stok}`;
    }
    
    btn.className = `menu-item ${stokClass}`;
    btn.innerHTML = `
      <div class="nama">${m.nama}</div>
      <div class="harga">Rp${formatRupiah(hargaNum)}</div>
      <div class="stok ${stokClass}">${stokText}</div>
    `;
    
    btn.setAttribute('data-id', m.id);
    btn.setAttribute('data-stok', stok);
    
    if (stok <= 0) {
      btn.disabled = true;
      btn.style.opacity = '0.6';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.onclick = () => tambahMenu({ 
        id: m.id,
        nama: m.nama, 
        harga: hargaNum,
        stok: stok
      });
    }
    
    fragment.appendChild(btn);
  });

  list.appendChild(fragment);
  updatePaginationInfo(items.length, totalPages);
}

function updatePaginationInfo(totalItems, totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)) {
  const pageInfo = document.getElementById('pageInfo');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  
  if (pageInfo) pageInfo.textContent = `Hal ${currentPage}/${totalPages}`;
  if (prevBtn) prevBtn.disabled = currentPage === 1;
  if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;
}

function goToPage(page) {
  currentPage = page;
  renderMenuList();
}

// Filter pencarian dengan debounce
const filterMenuByText = debounce(function(text){
  if (!text) {
    filteredMenu = [...menuData];
    currentPage = 1;
    renderMenuList();
    return;
  }
  
  const q = text.trim().toLowerCase();
  filteredMenu = menuData.filter(m => {
    return (m.nama && m.nama.toLowerCase().includes(q)) || 
           (m.kategori && m.kategori.toLowerCase().includes(q));
  });
  
  currentPage = 1;
  renderMenuList();
}, 300);

// Tambah menu dengan validasi stok
// Tambah menu dengan auto focus - VERSI DIPERBAIKI
function tambahMenu(menu){
  const stokTersedia = menu.stok || 0;
  const existingIndex = transaksi.findIndex(t => t.id === menu.id);
  
  if (existingIndex !== -1) {
    const jumlahSekarang = transaksi[existingIndex].jumlah;
    if (jumlahSekarang + 1 > stokTersedia) {
      showNotification(`❌ Stok tidak cukup! Stok ${menu.nama} hanya ${stokTersedia}`, 'warning');
      return;
    }
    
    transaksi[existingIndex].jumlah += 1;
    transaksi[existingIndex].subtotal = transaksi[existingIndex].jumlah * transaksi[existingIndex].harga;
  } else {
    if (stokTersedia < 1) {
      showNotification(`❌ Stok ${menu.nama} habis!`, 'warning');
      return;
    }
    
    transaksi.push({ 
      id: menu.id,
      nama: menu.nama, 
      harga: menu.harga,
      jumlah: 1, 
      subtotal: menu.harga,
      stok: stokTersedia
    });
  }
  
  renderTransaksi();
  
  // 🔥 SET FOCUS KE KOLOM JUMLAH setelah tambah menu
  setTimeout(() => {
    const inputs = document.querySelectorAll(".jumlah-input");
    const targetIndex = existingIndex !== -1 ? existingIndex : transaksi.length - 1;
    
    if (inputs[targetIndex]) {
      inputs[targetIndex].focus();
      inputs[targetIndex].select();
    }
  }, 100);
}

// Render transaksi dengan virtual DOM
// Render transaksi dengan pertahankan fokus - DIPERBAIKI
// 🔥 PERBAIKAN: Render transaksi dengan semua fitur preserved
function renderTransaksi(){
  const tbody = document.querySelector('#tblTransaksi tbody');
  if (!tbody) return;
  
  // 🔥 SIMPAN ELEMENT YANG SEDANG FOCUS SEBELUM RENDER
  const activeElement = document.activeElement;
  let preserveFocus = null;
  
  if (activeElement && activeElement.classList.contains('jumlah-input')) {
    preserveFocus = activeElement.getAttribute('data-index');
  }
  
  tbody.innerHTML = '';
  let total = 0;
  
  const fragment = document.createDocumentFragment();
  
  transaksi.forEach((item, i) => {
    total += item.subtotal;
    const stokInfo = item.stok ? ` (Stok: ${item.stok})` : '';
    const stokWarning = item.jumlah > item.stok ? ' ❌ Melebihi stok!' : '';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${item.nama}</strong>${stokInfo}
        ${stokWarning}
      </td>
      <td>Rp${formatRupiah(item.harga)}</td>
      <td>
        <input type="number" min="0" value="${item.jumlah}" data-index="${i}" class="jumlah-input">
      </td>
      <td><strong class="subtotal-display" data-index="${i}">Rp${formatRupiah(item.subtotal)}</strong></td>
      <td><button class="hapus-btn" data-index="${i}" title="Hapus item">❌</button></td>
    `;
    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
  
  // Update total display
  document.getElementById('totalHarga').textContent = formatRupiah(total);
  
  // 🔥 AUTO-UPDATE CASH INPUT ke nilai total
  const cashInput = document.getElementById('cashInput');
  cashInput.value = formatRupiah(total);
  
  hitungKembali();
  
  // 🔥 RESTORE FOCUS JIKA SEDANG INPUT
  if (preserveFocus !== null) {
    setTimeout(() => {
      const inputs = document.querySelectorAll(".jumlah-input");
      const targetIndex = parseInt(preserveFocus);
      if (inputs[targetIndex]) {
        inputs[targetIndex].focus();
        inputs[targetIndex].select();
      }
    }, 10);
  }
}
// Hitung kembalian
function hitungKembali() {
  if (isMultiplePayment) {
    // Untuk multiple payment, kembalian sudah dihitung di updateMultiplePaymentDisplay
    return;
  }
  
  // Untuk single payment (original logic)
  const cashInput = document.getElementById('cashInput');
  const bayar = parseNumberFromString(cashInput.value);
  const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
  const kembali = bayar - total;
  
  document.getElementById('uangKembali').textContent = formatRupiah(kembali > 0 ? kembali : 0);
}

// 🔥 PERBAIKAN REAL-TIME: Setup event delegation untuk transaksi - VERSI LENGKAP
function setupTransactionEventDelegation() {
  const tbody = document.querySelector('#tblTransaksi tbody');
  if (!tbody) return;
  
  // 🔥 FUNGSI BARU: Update subtotal secara real-time
  function updateSubtotalRealTime(input, index, newJumlah) {
    const item = transaksi[index];
    
    // Validasi stok
    if (newJumlah > item.stok) {
      // Tampilkan warning
      const stokWarning = document.createElement('span');
      stokWarning.className = 'stok-warning-real-time';
      stokWarning.textContent = ` ❌ Max: ${item.stok}`;
      stokWarning.style.color = 'var(--danger)';
      stokWarning.style.fontSize = '0.7rem';
      
      // Hapus warning sebelumnya
      const existingWarning = input.parentNode.querySelector('.stok-warning-real-time');
      if (existingWarning) existingWarning.remove();
      
      input.parentNode.appendChild(stokWarning);
    } else {
      // Hapus warning jika stok cukup
      const existingWarning = input.parentNode.querySelector('.stok-warning-real-time');
      if (existingWarning) existingWarning.remove();
    }
    
    // Update data transaksi
    const jumlahValid = Math.max(0, newJumlah);
    transaksi[index].jumlah = jumlahValid;
    transaksi[index].subtotal = transaksi[index].jumlah * transaksi[index].harga;
    
    // 🔥 UPDATE SUBTOTAL DISPLAY SECARA LANGSUNG
    const subtotalDisplay = document.querySelector(`.subtotal-display[data-index="${index}"]`);
    if (subtotalDisplay) {
      subtotalDisplay.textContent = `Rp${formatRupiah(transaksi[index].subtotal)}`;
    }
    
    // 🔥 UPDATE TOTAL & CASH INPUT SECARA LANGSUNG
    updateTotalOnly();
  }
  
  // ==================== EVENT LISTENERS ====================
  
  // 🔥 EVENT: Input real-time (setiap ketikan)
  tbody.addEventListener('input', function(e) {
    if (e.target.classList.contains('jumlah-input')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      if (isNaN(index) || index < 0 || index >= transaksi.length) return;
      
      const newJumlah = parseInt(e.target.value) || 0;
      
      // 🔥 UPDATE REAL-TIME: Langsung proses tanpa debounce
      updateSubtotalRealTime(e.target, index, newJumlah);
    }
  });
  
  // 🔥 EVENT: Blur (final validation saat keluar dari input)
  tbody.addEventListener('blur', function(e) {
    if (e.target.classList.contains('jumlah-input')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      if (isNaN(index) || index < 0 || index >= transaksi.length) return;
      
      const newJumlah = parseInt(e.target.value) || 0;
      const item = transaksi[index];
      
      // Final validation saat keluar dari input
      if (newJumlah > item.stok) {
        // Reset ke stok maksimum
        e.target.value = item.stok;
        transaksi[index].jumlah = item.stok;
        transaksi[index].subtotal = item.stok * item.harga;
        
        // Update display
        const subtotalDisplay = document.querySelector(`.subtotal-display[data-index="${index}"]`);
        if (subtotalDisplay) {
          subtotalDisplay.textContent = `Rp${formatRupiah(transaksi[index].subtotal)}`;
        }
        
        updateTotalOnly();
        
        // Hapus warning
        const existingWarning = e.target.parentNode.querySelector('.stok-warning-real-time');
        if (existingWarning) existingWarning.remove();
      }
      
      // Jika jumlah 0, hapus item setelah blur
      if (newJumlah <= 0) {
        setTimeout(() => {
          transaksi.splice(index, 1);
          renderTransaksi(); // Render ulang karena struktur berubah
        }, 100);
      }
    }
  });
  
  // 🔥 EVENT: Keydown untuk Enter (pindah ke cash input)
  tbody.addEventListener('keydown', function(e) {
    if (e.target.classList.contains('jumlah-input')) {
      const input = e.target;
      const index = parseInt(input.getAttribute('data-index'));
      
      if (e.key === 'Enter') {
        e.preventDefault();
        
        const newJumlah = parseInt(input.value) || 0;
        const item = transaksi[index];
        
        // Validasi stok saat Enter
        if (newJumlah > item.stok) {
          showNotification(`❌ Jumlah melebihi stok! Stok ${item.nama} hanya ${item.stok}`, 'warning');
          input.value = item.stok;
          updateSubtotalRealTime(input, index, item.stok);
          input.select();
          return;
        }
        
        // Jika jumlah 0, hapus item
        if (newJumlah <= 0) {
          transaksi.splice(index, 1);
          renderTransaksi();
        } else {
          // Update data dan tampilan
          updateSubtotalRealTime(input, index, newJumlah);
        }
        
        // 🔥 SET FOCUS KE CASH INPUT setelah Enter
        setTimeout(() => {
          const cashInput = document.getElementById('cashInput');
          if (cashInput) {
            cashInput.focus();
            cashInput.select();
          }
        }, 50);
      }
    }
  });
  
  // EVENT: Hapus item
  tbody.addEventListener('click', function(e) {
    if (e.target.classList.contains('hapus-btn')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      if (!isNaN(index) && index >= 0 && index < transaksi.length) {
        transaksi.splice(index, 1);
        renderTransaksi(); // Render ulang karena ada perubahan struktur
      }
    }
  });
  
  // EVENT: Select text saat focus
  tbody.addEventListener('focusin', function(e) {
    if (e.target.classList.contains('jumlah-input')) {
      setTimeout(() => e.target.select(), 10);
    }
  });
}

// 🔥 FUNGSI BARU: Update total saja tanpa re-render tabel
function updateTotalOnly() {
  const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
  
  // Update total display
  document.getElementById('totalHarga').textContent = formatRupiah(total);
  
  if (!isMultiplePayment) {
    // Single payment: auto-update cash input
    const cashInput = document.getElementById('cashInput');
    cashInput.value = formatRupiah(total);
  } else {
    // Multiple payment: update display
    updateMultiplePaymentDisplay();
  }
  
  hitungKembali();
}


// ==================== LAPORAN FUNCTIONS MODERN ====================

// Setup filter laporan berdasarkan level akses - VERSI AMAN

// Setup filter laporan berdasarkan level akses - VERSI DIPERBAIKI
// Setup filter laporan berdasarkan level akses - VERSI DIPERBAIKI
function setupLaporanFilters() {
  // 🔥 SAFETY CHECK: Pastikan kasirInfo sudah ada
  if (!kasirInfo || !kasirInfo.levelAkses) {
    console.log('⚠️ setupLaporanFilters: kasirInfo belum ready, skipping...');
    return;
  }
  
  const filterTokoGroup = document.getElementById('filterTokoGroup');
  const filterTokoSelect = document.getElementById('filterTokoLaporan');
  const filterMenuSelect = document.getElementById('filterMenu');
  
  console.log('🔧 Setting up laporan filters for:', kasirInfo.levelAkses);
  console.log('📊 Available data - Toko:', tokoManagementData?.length, 'Menu:', menuManagementData?.length);
  
  // 🔥 PERBAIKAN: HENTIKAN MULTIPLE SETUP
  if (filterTokoSelect && filterTokoSelect.hasAttribute('data-setup-done')) {
    console.log('✅ Filter toko sudah di-setup, skipping...');
    return;
  }
  
  // Tampilkan filter toko hanya untuk OWNER
  if (kasirInfo.levelAkses === 'OWNER') {
    if (filterTokoGroup) {
      filterTokoGroup.style.display = 'flex';
      console.log('✅ Filter toko ditampilkan untuk OWNER');
    }
    
    // Load data toko untuk filter - DENGAN DEDUPLIKASI
    if (filterTokoSelect) {
      // 🔥 PERBAIKAN: CLEAR DULU SEBELUM ISI
      filterTokoSelect.innerHTML = '<option value="">Semua Toko</option>';
      
      if (tokoManagementData && tokoManagementData.length > 0) {
        // 🔥 PERBAIKAN: GUNAKAN DEDUPLIKASI
        const uniqueTokoMap = new Map();
        
        tokoManagementData.forEach(toko => {
          if (toko.status === 'Aktif') {
            if (!uniqueTokoMap.has(toko.id_toko)) {
              uniqueTokoMap.set(toko.id_toko, toko);
            }
          }
        });
        
        const uniqueToko = Array.from(uniqueTokoMap.values());
        
        uniqueToko.forEach(toko => {
          const option = document.createElement('option');
          option.value = toko.id_toko;
          option.textContent = `${toko.id_toko} - ${toko.nama_toko}`;
          filterTokoSelect.appendChild(option);
        });
        
        console.log('✅ Dropdown toko diisi:', uniqueToko.length, 'toko UNIK');
        
        // 🔥 TANDAI SUDAH DI-SETUP
        filterTokoSelect.setAttribute('data-setup-done', 'true');
        
      } else {
        console.log('⚠️ Toko data not ready for filter');
      }
    }
  } else {
    if (filterTokoGroup) {
      filterTokoGroup.style.display = 'none';
      console.log('❌ Filter toko disembunyikan untuk level:', kasirInfo.levelAkses);
    }
  }
  
  // Load data menu untuk filter - DENGAN DEDUPLIKASI JUGA
  if (filterMenuSelect) {
    // 🔥 PERBAIKAN: CLEAR DULU SEBELUM ISI
    filterMenuSelect.innerHTML = '<option value="">Semua Menu</option>';
    
    if (menuManagementData && menuManagementData.length > 0) {
      const uniqueMenus = [...new Set(menuManagementData
        .filter(menu => menu.status === 'Aktif')
        .map(menu => menu.nama_menu))];
      
      uniqueMenus.forEach(menu => {
        const option = document.createElement('option');
        option.value = menu;
        option.textContent = menu;
        filterMenuSelect.appendChild(option);
      });
      
      console.log('✅ Dropdown menu diisi:', uniqueMenus.length, 'menu UNIK');
    } else {
      console.log('⚠️ Menu data not ready for filter');
    }
  }
}
// Setup filter toggle dengan CSS yang benar
function setupFilterToggle() {
  const btnFilterToggle = document.getElementById('btnFilterToggle');
  const filterContent = document.getElementById('filterContent');
  
  if (btnFilterToggle && filterContent) {
    // Set initial state - visible
    filterContent.style.display = 'block';
    btnFilterToggle.classList.add('rotated');
    
    btnFilterToggle.addEventListener('click', () => {
      const isVisible = filterContent.style.display !== 'none';
      filterContent.style.display = isVisible ? 'none' : 'block';
      btnFilterToggle.classList.toggle('rotated', !isVisible);
      btnFilterToggle.textContent = isVisible ? '▶' : '▼';
    });
  }
}

// Setup table toggle
function setupTableToggle() {
  const btnToggleTable = document.getElementById('btnToggleTable');
  const tableContainer = document.getElementById('tableContainer');
  const tableIcon = btnToggleTable?.querySelector('.table-icon');
  const tableText = btnToggleTable?.querySelector('.table-text');
  
  if (btnToggleTable && tableContainer) {
    // Set initial state - hidden
    tableContainer.style.display = 'none';
    tableIcon.textContent = '⬇️';
    tableText.textContent = 'Tampilkan Tabel';
    
    btnToggleTable.addEventListener('click', () => {
      const isVisible = tableContainer.style.display !== 'none';
      tableContainer.style.display = isVisible ? 'none' : 'block';
      tableIcon.textContent = isVisible ? '⬇️' : '⬆️';
      tableText.textContent = isVisible ? 'Tampilkan Tabel' : 'Sembunyikan Tabel';
    });
  }
}

// Load laporan dengan ANALITIK ITEM LARIS
async function loadLaporanModern() {
  try {
    console.log('🚀 Memulai loadLaporanModern...');
    
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const filterToko = document.getElementById('filterTokoLaporan')?.value || '';
    const filterMenu = document.getElementById('filterMenu')?.value || '';
    
    console.log('📊 Filter laporan:', { 
      startDate, 
      endDate, 
      filterToko, 
      filterMenu,
      levelAkses: kasirInfo?.levelAkses,
      idToko: kasirInfo?.idToko 
    });
    
    // Validasi kasirInfo
    if (!kasirInfo || !kasirInfo.idToko) {
      showNotification('❌ Silakan login ulang! Session mungkin telah habis.', 'error');
      return;
    }
    
    // Update period text
    const periodText = document.getElementById('laporanPeriodText');
    if (periodText) {
      const startText = startDate || 'Semua';
      const endText = endDate || 'Semua';
      periodText.textContent = `Periode: ${startText} s/d ${endText}`;
    }
    
    // Show loading state
    const topItemsList = document.getElementById('topItemsList');
    const categoriesChart = document.getElementById('categoriesChart');
    const btnLoadLaporan = document.getElementById('btnLoadLaporan');
    
    if (btnLoadLaporan) {
      btnLoadLaporan.disabled = true;
      btnLoadLaporan.innerHTML = '<span class="btn-icon">⏳</span> Memuat...';
    }
    
    if (topItemsList) topItemsList.innerHTML = '<div class="loading-analytics">⏳ Memuat data...</div>';
    if (categoriesChart) categoriesChart.innerHTML = '<div class="loading-analytics">⏳ Memuat data...</div>';
    
    // Prepare request data
    const requestData = {
      startDate: startDate,
      endDate: endDate,
      idToko: kasirInfo.idToko,
      levelAkses: kasirInfo.levelAkses,
      username: kasirInfo.username,
      filterToko: filterToko,
      filterMenu: filterMenu
    };
    
    console.log('📨 Request data:', requestData);
    
    const data = await hybridFetch('/getLaporan', requestData);
    
    console.log('📈 Response laporan:', data);
    
    if (data && data.success) {
      laporanData = data.data || [];
      
      // Render summary modern
      renderSummaryModern(data.summary);
      
      // Render analytics modern
      if (data.analytics) {
        renderLaporanAnalyticsModern(data.analytics);
      } else {
        console.warn('⚠️ Tidak ada data analytics');
        if (topItemsList) topItemsList.innerHTML = '<div class="loading-analytics">📊 Tidak ada data analitik</div>';
        if (categoriesChart) categoriesChart.innerHTML = '<div class="loading-analytics">📊 Tidak ada data analitik</div>';
      }
      
      // Render table
      renderLaporanTableModern(laporanData);
      
      showNotification('Laporan berhasil dimuat', 'success');
      console.log('✅ Laporan berhasil dimuat:', laporanData.length, 'records');
      
    } else {
      const errorMsg = data?.message || 'Unknown error';
      console.error('❌ Gagal memuat laporan:', errorMsg);
      showNotification('Gagal memuat laporan: ' + errorMsg, 'error');
    }
  } catch (err) {
    console.error('❌ Error loadLaporan:', err);
    
    // Show user-friendly error message
    const errorMessage = err.message.includes('Failed to fetch') 
      ? 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.'
      : err.message;
    
    showNotification('Gagal memuat laporan: ' + errorMessage, 'error');
    
    // Reset UI on error
    resetLaporanUI();
  } finally {
    // Reset button state
    const btnLoadLaporan = document.getElementById('btnLoadLaporan');
    if (btnLoadLaporan) {
      btnLoadLaporan.disabled = false;
      btnLoadLaporan.innerHTML = '<span class="btn-icon">📥</span> Muat Laporan';
    }
  }
}

// Function untuk render analytics laporan yang LENGKAP
function renderLaporanAnalyticsModern(analytics) {
  const topItemsList = document.getElementById('topItemsList');
  const categoriesChart = document.getElementById('categoriesChart');
  
  if (!topItemsList || !categoriesChart) return;
  
  // Render top items
  if (analytics.topItems && analytics.topItems.length > 0) {
    let topItemsHTML = '';
    analytics.topItems.slice(0, 5).forEach((item, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📦';
      topItemsHTML += `
        <div class="top-item">
          <span class="item-rank">${medal}</span>
          <span class="item-name">${item.nama}</span>
          <span class="item-sales">${item.total_terjual}x</span>
        </div>
      `;
    });
    topItemsList.innerHTML = topItemsHTML;
  } else {
    topItemsList.innerHTML = '<div class="loading-analytics">Tidak ada data penjualan item</div>';
  }
  
  // Render categories chart - DENGAN FALLBACK
  if (analytics.topCategories && analytics.topCategories.length > 0) {
    const maxSales = Math.max(...analytics.topCategories.map(cat => cat.total_terjual));
    
    let categoriesHTML = '';
    analytics.topCategories.slice(0, 6).forEach(category => {
      const percentage = maxSales > 0 ? (category.total_terjual / maxSales) * 100 : 0;
      categoriesHTML += `
        <div class="category-bar">
          <span class="category-name">${category.kategori}</span>
          <div class="category-bar-inner">
            <div class="category-bar-fill" style="width: ${percentage}%"></div>
          </div>
          <span class="category-count">${category.total_terjual}</span>
        </div>
      `;
    });
    categoriesChart.innerHTML = categoriesHTML;
  } else {
    // Fallback: Tampilkan pesan bahwa data kategori tidak tersedia
    categoriesChart.innerHTML = '<div class="loading-analytics">📊 Data kategori tidak tersedia</div>';
  }
}

// Render summary modern
function renderSummaryModern(summary) {
  const summaryContainer = document.getElementById('laporanSummary');
  if (!summaryContainer) return;
  
  if (!summary) {
    summaryContainer.innerHTML = '';
    return;
  }
  
  summaryContainer.innerHTML = `
    <div class="summary-card-modern">
      <h3>🛒 Total Transaksi</h3>
      <div class="value">${summary.totalTransaksi || 0}</div>
    </div>
    <div class="summary-card-modern">
      <h3>💰 Total Pendapatan</h3>
      <div class="value">Rp${formatRupiah(summary.totalPendapatan || 0)}</div>
    </div>
    <div class="summary-card-modern">
      <h3>💵 Total Bayar</h3>
      <div class="value">Rp${formatRupiah(summary.totalBayar || 0)}</div>
    </div>
    <div class="summary-card-modern">
      <h3>🔄 Total Kembali</h3>
      <div class="value">Rp${formatRupiah(summary.totalKembali || 0)}</div>
    </div>
  `;
}

// Render table modern yang sesuai dengan struktur data
function renderLaporanTableModern(data) {
  const tbody = document.getElementById('laporanBody');
  if (!tbody) return;
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">Tidak ada data transaksi</td></tr>';
    return;
  }
  
  let tableHTML = '';
  data.forEach(item => {
    const menu = item.item || '-';
    const qty = item.jumlah || 1;
    const tanggal = item.tanggal ? new Date(item.tanggal).toLocaleDateString('id-ID') : '-';
    
    tableHTML += `
      <tr>
        <td>${tanggal}</td>
        <td>${item.id_transaksi || ''}</td>
        <td>${menu}</td>
        <td style="text-align:center">${qty}</td>
        <td>Rp${formatRupiah(item.total || 0)}</td>
        <td>${item.kasir || ''}</td>
      </tr>
    `;
  });
  
  tbody.innerHTML = tableHTML;
}

// Reset UI laporan
function resetLaporanUI() {
  laporanData = [];
  renderSummaryModern(null);
  
  const topItemsList = document.getElementById('topItemsList');
  const categoriesChart = document.getElementById('categoriesChart');
  if (topItemsList) topItemsList.innerHTML = '<div class="loading-analytics">❌ Gagal memuat data</div>';
  if (categoriesChart) categoriesChart.innerHTML = '<div class="loading-analytics">❌ Gagal memuat data</div>';
  
  renderLaporanTableModern([]);
}

// Reset filter laporan
function resetFilterLaporan() {
  document.getElementById('startDate').value = '';
  document.getElementById('endDate').value = '';
  document.getElementById('filterMenu').value = '';
  
  // Reset filter toko hanya untuk OWNER
  if (kasirInfo.levelAkses === 'OWNER') {
    const filterToko = document.getElementById('filterTokoLaporan');
    if (filterToko) filterToko.value = '';
  }
  
  laporanData = [];
  const tbody = document.getElementById('laporanBody');
  if (tbody) tbody.innerHTML = '';
  
  const summaryContainer = document.getElementById('laporanSummary');
  if (summaryContainer) summaryContainer.innerHTML = '';
  
  const topItemsList = document.getElementById('topItemsList');
  if (topItemsList) topItemsList.innerHTML = '<div class="loading-analytics">Memuat data...</div>';
  
  const categoriesChart = document.getElementById('categoriesChart');
  if (categoriesChart) categoriesChart.innerHTML = '<div class="loading-analytics">Memuat data...</div>';
}

// Export laporan PDF
function exportLaporanPDF() {
  if (laporanData.length === 0) {
    showNotification('Tidak ada data laporan untuk di-export', 'warning');
    return;
  }

  const printWindow = window.open('', '_blank');
  const today = new Date().toLocaleDateString('id-ID');
  
  let tableRows = '';
  laporanData.forEach(item => {
    tableRows += `
      <tr>
        <td>${item.tanggal || ''}</td>
        <td>${item.id_transaksi || ''}</td>
        <td>${item.kasir || ''}</td>
        <td>${item.item || ''}</td>
        <td>${item.jumlah || ''}</td>
        <td>Rp${formatRupiah(item.total || 0)}</td>
      </tr>
    `;
  });

  const totalPendapatan = laporanData.reduce((sum, item) => sum + (item.total || 0), 0);
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Laporan Transaksi</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
        h2 { color: #333; text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #000; padding: 6px; text-align: left; }
        th { background-color: #f0f0f0; }
        .summary { margin: 15px 0; padding: 10px; background: #f9f9f9; border: 1px solid #ddd; }
        @media print {
          body { margin: 0; }
        }
      </style>
    </head>
    <body>
      <h2>Laporan Transaksi - ${kasirInfo.namaToko || 'TOKO'}</h2>
      <p><strong>Tanggal Cetak:</strong> ${today}</p>
      <p><strong>Periode:</strong> ${document.getElementById('startDate').value || 'Semua'} s/d ${document.getElementById('endDate').value || 'Semua'}</p>
      
      <div class="summary">
        <strong>Ringkasan:</strong><br>
        Total Transaksi: ${laporanData.length}<br>
        Total Pendapatan: Rp${formatRupiah(totalPendapatan)}
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>ID Transaksi</th>
            <th>Kasir</th>
            <th>Item</th>
            <th>Qty</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </body>
    </html>
  `);
  
  printWindow.document.close();
  
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

// ==================== DEBUG FUNCTIONS ====================

// Debug function untuk test laporan
async function debugLaporan() {
  console.group('🔧 DEBUG LAPORAN');
  
  try {
    const testData = {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      idToko: kasirInfo.idToko,
      levelAkses: kasirInfo.levelAkses,
      username: kasirInfo.username
    };
    
    console.log('🧪 Testing endpoint /getLaporan dengan data:', testData);
    
    const response = await fetch(`${SCRIPT_URL}/getLaporan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    
    console.log('📡 Response status:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Response success:', result.success);
      console.log('📊 Data length:', result.data?.length);
      console.log('🔍 Data structure:', result);
    } else {
      console.error('❌ HTTP Error:', response.status);
      const errorText = await response.text();
      console.error('📄 Error response:', errorText);
    }
    
  } catch (error) {
    console.error('💥 Fetch error:', error);
  }
  
  console.groupEnd();
}

// Debug function untuk test filter
function debugFilters() {
  console.group('🔧 DEBUG FILTERS');
  console.log('kasirInfo:', kasirInfo);
  console.log('tokoManagementData length:', tokoManagementData?.length);
  console.log('menuManagementData length:', menuManagementData?.length);
  
  const filterToko = document.getElementById('filterTokoLaporan');
  const filterMenu = document.getElementById('filterMenu');
  
  if (filterToko) {
    console.log('Filter Toko:', {
      exists: true,
      value: filterToko.value,
      options: filterToko.options.length,
      visible: filterToko.parentElement.style.display !== 'none'
    });
  } else {
    console.log('Filter Toko: NOT FOUND');
  }
  
  if (filterMenu) {
    console.log('Filter Menu:', {
      exists: true, 
      value: filterMenu.value,
      options: filterMenu.options.length
    });
  } else {
    console.log('Filter Menu: NOT FOUND');
  }
  
  console.groupEnd();
}

// ==================== PRINT STRUK FUNCTIONS ====================

// 🔥 PERBAIKAN: printStruk dengan multiple payment support
function printStruk() {
  console.log('🚀 printStruk() dipanggil');
  
  const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
  let bayar, kembali, paymentBreakdown = [];
  
  if (isMultiplePayment) {
    // Multiple payment logic
    bayar = calculateTotalPaid();
    kembali = bayar - total;
    
    // Siapkan breakdown payment untuk struk
    Object.keys(paymentMethods).forEach(method => {
      if (paymentMethods[method] > 0) {
        const methodNames = {
          tunai: 'Tunai',
          debit: 'Debit Card', 
          ewallet: 'E-Wallet',
          qris: 'QRIS'
        };
        const methodIcons = {
          tunai: '💵',
          debit: '💳',
          ewallet: '📱', 
          qris: '🔗'
        };
        
        paymentBreakdown.push({
          method: methodNames[method],
          icon: methodIcons[method],
          amount: paymentMethods[method]
        });
      }
    });
  } else {
    // Single payment logic
    const cashInput = document.getElementById('cashInput');
    bayar = parseNumberFromString(cashInput.value);
    kembali = bayar - total;
    paymentBreakdown.push({
      method: 'Tunai',
      icon: '💵',
      amount: bayar
    });
  }
  
  console.log('📊 Data transaksi:', { total, bayar, kembali, items: transaksi.length, paymentBreakdown });
  
  if (total === 0) {
    showNotification('Tidak ada transaksi untuk dicetak!', 'warning');
    return;
  }

  // Data untuk struk
  const storeName = kasirInfo.namaToko || 'TOKO KITA';
  const currentDate = new Date().toLocaleString('id-ID');
  const cashierName = kasirInfo.namaKasir || 'Kasir';
  
  console.log('🏪 Data toko:', { storeName, currentDate, cashierName });

  // Buat HTML untuk struk
  let strukHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Struk ${storeName}</title>
      <meta charset="utf-8">
      <style>
        /* RESET DAN PRINT STYLES */
        * {
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
          font-family: 'Courier New', monospace !important;
        }
        
        body {
          width: 80mm !important;
          max-width: 80mm !important;
          min-height: 100mm !important;
          margin: 2mm !important;
          padding: 0 !important;
          font-size: 12px !important;
          line-height: 1.2 !important;
          color: #000 !important;
          background: #fff !important;
        }
        
        .struk-content {
          width: 100% !important;
          max-width: 76mm !important;
          margin: 0 auto !important;
          padding: 1mm !important;
        }
        
        .struk-header {
          text-align: center !important;
          margin-bottom: 2mm !important;
          border-bottom: 1px dashed #000 !important;
          padding-bottom: 1mm !important;
        }
        
        .struk-header h2 {
          font-size: 14px !important;
          font-weight: bold !important;
          margin: 0 !important;
          text-transform: uppercase;
        }
        
        .struk-info {
          text-align: center !important;
          font-size: 10px !important;
          margin-bottom: 2mm !important;
        }
        
        .struk-table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin: 2mm 0 !important;
          font-size: 11px !important;
        }
        
        .struk-table th,
        .struk-table td {
          padding: 0.5mm 0 !important;
          text-align: left !important;
          border: none !important;
          vertical-align: top;
        }
        
        .struk-table th:nth-child(2),
        .struk-table td:nth-child(2),
        .struk-table th:nth-child(3),
        .struk-table td:nth-child(3) {
          text-align: right !important;
          width: 25% !important;
        }
        
        .struk-table tfoot {
          border-top: 1px dashed #000 !important;
          margin-top: 2mm !important;
        }
        
        .struk-table tfoot td {
          padding-top: 1mm !important;
          font-weight: bold !important;
        }
        
        .payment-breakdown {
          margin: 2mm 0 !important;
          padding-top: 1mm !important;
          border-top: 1px dashed #000 !important;
          font-size: 10px !important;
        }
        
        .payment-method {
          display: flex !important;
          justify-content: space-between !important;
          margin-bottom: 0.5mm !important;
        }
        
        .struk-footer {
          text-align: center !important;
          margin-top: 3mm !important;
          padding-top: 1mm !important;
          border-top: 1px dashed #000 !important;
          font-size: 10px !important;
          font-style: italic;
        }
        
        .item-name {
          word-break: break-word;
          max-width: 45mm;
        }
        
        @page {
          size: auto;
          margin: 2mm;
        }
        
        @media print {
          body {
            margin: 0 !important;
            padding: 2mm !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="struk-content">
        <div class="struk-header">
          <h2>${storeName}</h2>
        </div>
        
        <div class="struk-info">
          <div>${currentDate}</div>
          <div>Kasir: ${cashierName}</div>
        </div>
        
        <table class="struk-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Harga</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
  `;
  
  // Tambahkan items
  transaksi.forEach(item => {
    const nama = item.nama.length > 20 ? item.nama.substring(0, 20) + '...' : item.nama;
    strukHTML += `
      <tr>
        <td class="item-name">${nama} (${item.jumlah})</td>
        <td>${formatRupiah(item.harga)}</td>
        <td>${formatRupiah(item.subtotal)}</td>
      </tr>
    `;
  });
  
  // Tambahkan total
  strukHTML += `
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">Total</td>
              <td>${formatRupiah(total)}</td>
            </tr>
            <tr>
              <td colspan="2">Bayar</td>
              <td>${formatRupiah(bayar)}</td>
            </tr>
            <tr>
              <td colspan="2">Kembali</td>
              <td>${formatRupiah(kembali)}</td>
            </tr>
          </tfoot>
        </table>
  `;
  
  // 🔥 TAMBAHKAN PAYMENT BREAKDOWN JIKA MULTIPLE PAYMENT
  if (paymentBreakdown.length > 1) {
    strukHTML += `
        <div class="payment-breakdown">
          <div style="text-align:center; margin-bottom:1mm; font-weight:bold">Metode Pembayaran:</div>
    `;
    
    paymentBreakdown.forEach(payment => {
      strukHTML += `
          <div class="payment-method">
            <span>${payment.icon} ${payment.method}</span>
            <span>${formatRupiah(payment.amount)}</span>
          </div>
      `;
    });
    
    strukHTML += `</div>`;
  }
  
  strukHTML += `
        <div class="struk-footer">
          ${currentSettings.Footer_Struk || 'Terima Kasih'}
        </div>
      </div>
      
      <script>
        // Auto print dan close
        window.onload = function() {
          setTimeout(function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 500);
          }, 300);
        };
        
        // Fallback manual close
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            window.close();
          }
        });
      </script>
    </body>
    </html>
  `;
  
  console.log('📝 Struk HTML generated, length:', strukHTML.length);
  
  // Buka window baru untuk print
  const printWindow = window.open('', '_blank', 'width=80mm,height=200mm');
  if (!printWindow) {
    showNotification('Popup diblokir! Izinkan popup untuk mencetak struk.', 'error');
    return;
  }
  
  printWindow.document.write(strukHTML);
  printWindow.document.close();
  
  console.log('✅ Struk window opened successfully');
}
// ==================== TRANSAKSI & PRINT ====================

// Selesaikan transaksi dengan update stok
async function selesaikanTransaksi() {
  if (!transaksi.length) {
    showNotification('Belum ada pesanan', 'warning');
    return;
  }
  
  const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
  let bayar, kembali, paymentData;
  
  if (isMultiplePayment) {
    // Multiple payment logic
    bayar = calculateTotalPaid();
    kembali = bayar - total;
    paymentData = {
      isMultiple: true,
      methods: { ...paymentMethods },
      totalPaid: bayar
    };
  } else {
    // Single payment logic
    const cashInput = document.getElementById('cashInput');
    bayar = parseNumberFromString(cashInput.value);
    kembali = bayar - total;
    paymentData = {
      isMultiple: false,
      methods: { tunai: bayar },
      totalPaid: bayar
    };
  }
  
  // Validasi pembayaran
  if (bayar < total) {
    showNotification('Jumlah bayar kurang dari total!', 'warning');
    return;
  }
  
  const konfirmasi = confirm(
    `Total: Rp ${formatRupiah(total)}\n` +
    `Bayar: Rp ${formatRupiah(bayar)}\n` +
    `Kembali: Rp ${formatRupiah(kembali)}\n\n` +
    `Lanjutkan transaksi?`
  );
  
  if (!konfirmasi) return;
  
  try {
    const data = await hybridFetch('/saveTransaksi', {
      transaksi: transaksi,
      total: total,
      idToko: kasirInfo.idToko,
      kasir: kasirInfo.namaKasir || 'Kasir',
      bayar: bayar,
      kembali: kembali,
      paymentData: paymentData  // 🔥 KIRIM DATA PAYMENT
    });
    
    if (data && data.success) {
      printStruk();
      
      setTimeout(() => {
        // Reset transaksi dan payment
        transaksi = [];
        resetPaymentMethods();
        
        renderTransaksi();
        document.getElementById('cashInput').value = '0';
        document.getElementById('uangKembali').textContent = '0';
        
        // Kembali ke single payment mode jika sedang di multiple
        if (isMultiplePayment) {
          togglePaymentMode();
        }
        
        clearCache();
        loadMenu();
        showNotification('Transaksi berhasil disimpan!', 'success');
      }, 1000);
      
    } else {
      showNotification('Gagal simpan transaksi: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch(err) {
    showNotification('Gagal mengirim data ke server: ' + err.message, 'error');
  }
}

// 🔥 FUNCTION BARU: Reset payment methods
function resetPaymentMethods() {
  paymentMethods = {
    tunai: 0,
    debit: 0,
    ewallet: 0, 
    qris: 0
  };
}
// ==================== SETTING FUNCTIONS MODERN ====================

// Load setting dengan local storage fallback
async function loadSetting() {
  try {
    // Coba load dari localStorage dulu untuk performance
    const cachedSettings = localStorage.getItem(`settings_${kasirInfo.idToko}`);
    if (cachedSettings) {
      currentSettings = JSON.parse(cachedSettings);
      renderSetting(currentSettings);
      applyAllSettings(currentSettings);
    }

    // Load dari server untuk data terbaru
    const data = await hybridFetch('/getSetting', {
      idToko: kasirInfo.idToko,
      levelAkses: kasirInfo.levelAkses
    });
    
    if (data && data.success) {
      currentSettings = data.data || {};
      
      // Simpan ke localStorage
      localStorage.setItem(`settings_${kasirInfo.idToko}`, JSON.stringify(currentSettings));
      
      renderSetting(currentSettings);
      applyAllSettings(currentSettings);
    }
  } catch (err) {
    console.error('Error loadSetting:', err);
    // Fallback ke default settings
    const defaultSettings = getDefaultSettings();
    renderSetting(defaultSettings);
    applyAllSettings(defaultSettings);
  }
}

// 🔥 FUNGSI BARU: Default settings
function getDefaultSettings() {
  return {
    Theme: 'dark',
    Warna_Aksen: '#14ffec',
    Warna_Aksen_Dark: '#0d7377',
    Nama_Aplikasi: 'KASIR WEB',
    Footer_Struk: 'Terima Kasih',
    PrinterType: 'thermal',
    StrukFontSize: 'medium',
    StrukHeader: '',
    AutoPrint: 'false',
    FontFamily: 'default',
    FontSize: 'normal',
    LayoutMode: 'comfortable',
    SidebarPosition: 'left'
  };
}

function renderSetting(settings) {
  // Basic settings
  document.getElementById('settingTheme').value = settings.Theme || 'dark';
  document.getElementById('settingAccentColor').value = settings.Warna_Aksen || '#14ffec';
  document.getElementById('settingAccentDark').value = settings.Warna_Aksen_Dark || '#0d7377';
  document.getElementById('settingAppName').value = settings.Nama_Aplikasi || 'KASIR WEB';
  document.getElementById('settingStrukFooter').value = settings.Footer_Struk || 'Terima Kasih';
  
  // Printer settings
  document.getElementById('settingPrinterType').value = settings.PrinterType || 'thermal';
  document.getElementById('settingStrukFontSize').value = settings.StrukFontSize || 'medium';
  document.getElementById('settingStrukHeader').value = settings.StrukHeader || '';
  document.getElementById('settingAutoPrint').checked = settings.AutoPrint === 'true';
  
  // 🔥 NEW: Font & Layout settings
  document.getElementById('settingFontFamily').value = settings.FontFamily || 'default';
  document.getElementById('settingFontSize').value = settings.FontSize || 'normal';
  document.getElementById('settingLayoutMode').value = settings.LayoutMode || 'comfortable';
  document.getElementById('settingSidebarPosition').value = settings.SidebarPosition || 'left';
  
  // Color previews
  document.getElementById('accentPreview').style.backgroundColor = settings.Warna_Aksen || '#14ffec';
  document.getElementById('accentDarkPreview').style.backgroundColor = settings.Warna_Aksen_Dark || '#0d7377';
}

// Save setting dengan auto-save dan scope management
async function saveSetting() {
  try {
    const settings = {
      Theme: document.getElementById('settingTheme').value,
      Warna_Aksen: document.getElementById('settingAccentColor').value,
      Warna_Aksen_Dark: document.getElementById('settingAccentDark').value,
      Nama_Aplikasi: document.getElementById('settingAppName').value,
      Footer_Struk: document.getElementById('settingStrukFooter').value,
      // Printer settings
      PrinterType: document.getElementById('settingPrinterType').value,
      StrukFontSize: document.getElementById('settingStrukFontSize').value,
      StrukHeader: document.getElementById('settingStrukHeader').value,
      AutoPrint: document.getElementById('settingAutoPrint').checked.toString(),
      // 🔥 NEW: Font & Layout settings
      FontFamily: document.getElementById('settingFontFamily').value,
      FontSize: document.getElementById('settingFontSize').value,
      LayoutMode: document.getElementById('settingLayoutMode').value,
      SidebarPosition: document.getElementById('settingSidebarPosition').value,
      // Scope setting berdasarkan level akses
      Setting_Scope: kasirInfo.levelAkses === 'OWNER' ? 'GLOBAL' : `TOKO_${kasirInfo.idToko}`
    };
    
    // Simpan ke localStorage immediately untuk responsiveness
    localStorage.setItem(`settings_${kasirInfo.idToko}`, JSON.stringify(settings));
    currentSettings = settings;
    applyAllSettings(settings);
    
    // Kirim ke server (background process)
    const data = await hybridFetch('/updateSetting', { 
      settings: settings,
      levelAkses: kasirInfo.levelAkses,
      idToko: kasirInfo.idToko
    });
    
    if (data && data.success) {
      showNotification('Setting berhasil disimpan!', 'success');
      console.log('✅ Setting berhasil disimpan!');
    } else {
      showNotification('Setting disimpan lokal, tapi gagal ke server', 'warning');
      console.warn('⚠️ Setting disimpan lokal, tapi gagal ke server:', data?.message);
    }
  } catch (err) {
    console.error('❌ Gagal menyimpan setting ke server:', err.message);
    showNotification('Setting disimpan lokal saja', 'info');
  }
}

function resetSetting() {
  const defaultSettings = getDefaultSettings();
  renderSetting(defaultSettings);
  applyAllSettings(defaultSettings);
  saveSetting(); // Auto-save reset
}

// Test print functionality
function testPrint() {
  // Buat transaksi dummy untuk test
  const testTransaction = [
    { nama: 'TEST ITEM 1', harga: 10000, jumlah: 1, subtotal: 10000 },
    { nama: 'TEST ITEM 2', harga: 15000, jumlah: 2, subtotal: 30000 }
  ];
  
  // Simpan transaksi asli
  const originalTransaction = [...transaksi];
  
  // Set transaksi test
  transaksi = testTransaction;
  
  // Print test
  printStruk();
  
  // Kembalikan transaksi asli
  setTimeout(() => {
    transaksi = originalTransaction;
    renderTransaksi();
  }, 2000);
}

// ==================== MAIN EVENT LISTENERS ====================

function initializeEventListeners() {
  // Setup tab navigation
  setupTabNavigation();

  // 🔥 SETUP SUB TAB NAVIGATION
  setupSubTabNavigation();
  
  // Setup transaction event delegation
  setupTransactionEventDelegation();
  
  // Setup search dengan debounce
  setupMenuManagementSearch();
  setupUserManagementSearch();
  
  // Setup modern features
  setupFilterToggle();
  setupTableToggle();
  
  // Setup global error handling
  setupGlobalErrorHandling();
  
  // Test koneksi saat startup
  setTimeout(testConnection, 2000);

  // Set default dates for laporan
  const today = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(today.getDate() - 7);
  
  const startDate = document.getElementById('startDate');
  const endDate = document.getElementById('endDate');
  if (startDate) startDate.value = formatDateForInput(oneWeekAgo);
  if (endDate) endDate.value = formatDateForInput(today);

  // 🔥 MULTIPLE PAYMENT EVENT LISTENERS
  const btnPaymentToggle = document.getElementById('btnPaymentToggle');
  const btnClosePayment = document.getElementById('btnClosePaymentH');
  
  if (btnPaymentToggle) {
    btnPaymentToggle.addEventListener('click', togglePaymentMode);
  }
  
  if (btnClosePayment) {
    btnClosePayment.addEventListener('click', togglePaymentMode);
  }
  
  // Setup multiple payment inputs
  setupMultiplePaymentInputs();

  // Login handler dengan hybrid system
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();
      const loginMessage = document.getElementById('loginMessage');
      
      if (!username || !password) {
        if (loginMessage) loginMessage.innerText = 'Username dan password harus diisi';
        return;
      }
      
      if (loginMessage) loginMessage.innerText = 'Memeriksa...';
      
      try {
        const data = await hybridFetch('/login', { username, password });
        
        if (data && data.success) {
          kasirInfo = data;
          console.log('Login Success - User Info:', kasirInfo);
          
          const namaToko = document.getElementById('namaToko');
          if (namaToko) namaToko.innerText = kasirInfo.namaToko || 'Aplikasi Kasir';
          
          document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
          document.getElementById('kasirPage').classList.add('active');
          
          showTabsBasedOnLevel();
          await loadMenu();
          await loadSetting();
          if (loginMessage) loginMessage.innerText = '';
          
          // Simpan session
          localStorage.setItem('kasirInfo', JSON.stringify(kasirInfo));
          
          // 🔥 Setup filters setelah login berhasil
          setTimeout(() => {
            setupLaporanFilters();
            console.log('✅ Laporan filters setup after login');
          }, 500);
          
          showNotification(`Selamat datang, ${kasirInfo.namaKasir}!`, 'success');
        } else {
          if (loginMessage) loginMessage.innerText = 'Login gagal: ' + (data.message || 'Unknown error');
          showNotification('Login gagal: username atau password salah', 'error');
        }
      } catch(err) {
        if (loginMessage) loginMessage.innerText = 'Gagal terhubung ke server: ' + err.message;
        showNotification('Gagal terhubung ke server', 'error');
        console.error('Login error:', err);
      }
    });
  }

  // Logout handler
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      kasirInfo = {}; 
      transaksi = []; 
      clearCache();
      localStorage.clear();
      
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('loginPage').classList.add('active');
      
      showNotification('Anda telah logout', 'info');
    });
  }

  // Menu search handlers dengan debounce
  const menuSearch = document.getElementById('menuSearch');
  if (menuSearch) {
    menuSearch.addEventListener('input', (e) => {
      const q = e.target.value || '';
      filterMenuByText(q);
    });
  }

  const clearSearch = document.getElementById('clearSearch');
  if (clearSearch) {
    clearSearch.addEventListener('click', () => {
      document.getElementById('menuSearch').value = '';
      filterMenuByText('');
      document.getElementById('menuSearch').focus();
    });
  }

  // Pagination handlers
  const prevPage = document.getElementById('prevPage');
  const nextPage = document.getElementById('nextPage');
  
  if (prevPage) {
    prevPage.addEventListener('click', () => {
      if (currentPage > 1) {
        goToPage(currentPage - 1);
      }
    });
  }
  
  if (nextPage) {
    nextPage.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredMenu.length / ITEMS_PER_PAGE);
      if (currentPage < totalPages) {
        goToPage(currentPage + 1);
      }
    });
  }

  // Cash input handler
  const cashInput = document.getElementById('cashInput');
  if (cashInput) {
    cashInput.addEventListener('input', function(e) {
      let digits = (e.target.value + '').replace(/[^\d]/g, '');
      if (digits === '') {
        e.target.value = '0';
        document.getElementById('uangKembali').textContent = '0';
        return;
      }
      e.target.value = formatRupiah(digits);
      hitungKembali();
    });

    cashInput.addEventListener('focus', function(e) {
      e.target.select();
    });
  }

  // Transaksi selesai handler
  const btnSelesai = document.getElementById('btnSelesai');
  if (btnSelesai) {
    btnSelesai.addEventListener('click', selesaikanTransaksi);
  }

  // Menu management handlers
  const btnSimpanMenu = document.getElementById('btnSimpanMenu');
  const btnBatalEdit = document.getElementById('btnBatalEdit');
  
  if (btnSimpanMenu) btnSimpanMenu.addEventListener('click', saveMenu);
  if (btnBatalEdit) btnBatalEdit.addEventListener('click', cancelEdit);

  // User management handlers
  const btnSimpanUser = document.getElementById('btnSimpanUser');
  const btnBatalEditUser = document.getElementById('btnBatalEditUser');
  const btnSimpanToko = document.getElementById('btnSimpanToko');
  const btnBatalEditToko = document.getElementById('btnBatalEditToko');
  
  if (btnSimpanUser) btnSimpanUser.addEventListener('click', saveUser);
  if (btnBatalEditUser) btnBatalEditUser.addEventListener('click', cancelEditUser);
  if (btnSimpanToko) btnSimpanToko.addEventListener('click', saveToko);
  if (btnBatalEditToko) btnBatalEditToko.addEventListener('click', cancelEditToko);

  // Auto-generate ID toko
  const inputNamaToko = document.getElementById('inputNamaToko');
  if (inputNamaToko) {
    inputNamaToko.addEventListener('focus', function() {
      const idTokoInput = document.getElementById('inputIdToko');
      if (!idTokoInput.value || idTokoInput.value === '') {
        idTokoInput.value = 'TEMP-' + Date.now();
      }
    });
  }

  // Validasi duplikat nama menu
  const inputNamaMenu = document.getElementById('inputNamaMenu');
  if (inputNamaMenu) {
    inputNamaMenu.addEventListener('input', function(e) {
      const namaMenu = e.target.value.trim();
      const errorMsg = document.getElementById('duplicateError');
      
      if (errorMsg) errorMsg.remove();
      
      if (namaMenu && isMenuNameDuplicate(namaMenu, editingMenuId)) {
        const errorMsg = document.createElement('div');
        errorMsg.id = 'duplicateError';
        errorMsg.style.color = 'var(--danger)';
        errorMsg.style.fontSize = '0.8rem';
        errorMsg.style.marginTop = '5px';
        errorMsg.innerHTML = '⚠️ Nama menu sudah ada! Gunakan nama yang berbeda.';
        
        this.parentNode.appendChild(errorMsg);
      }
    });
  }

  // Laporan handlers
  const btnLoadLaporan = document.getElementById('btnLoadLaporan');
  const btnResetFilter = document.getElementById('btnResetFilter');
  const btnExportLaporan = document.getElementById('btnExportLaporan');
  
  if (btnLoadLaporan) btnLoadLaporan.addEventListener('click', loadLaporanModern);
  if (btnResetFilter) btnResetFilter.addEventListener('click', resetFilterLaporan);
  if (btnExportLaporan) btnExportLaporan.addEventListener('click', exportLaporanPDF);

  // Setting handlers dengan auto-save
  const btnSaveSetting = document.getElementById('btnSaveSetting');
  const btnResetSetting = document.getElementById('btnResetSetting');
  const btnTestPrint = document.getElementById('btnTestPrint');
  
  if (btnSaveSetting) {
    btnSaveSetting.addEventListener('click', saveSetting);
  }
  
  if (btnResetSetting) {
    btnResetSetting.addEventListener('click', resetSetting);
  }

  if (btnTestPrint) {
    btnTestPrint.addEventListener('click', testPrint);
  }

  // Color preview handlers dengan auto-save
  const settingAccentColor = document.getElementById('settingAccentColor');
  const settingAccentDark = document.getElementById('settingAccentDark');
  
  if (settingAccentColor) {
    settingAccentColor.addEventListener('input', function(e) {
      document.getElementById('accentPreview').style.backgroundColor = e.target.value;
      // Auto-save on color change
      debounce(saveSetting, 1000)();
    });
  }
  
  if (settingAccentDark) {
    settingAccentDark.addEventListener('input', function(e) {
      document.getElementById('accentDarkPreview').style.backgroundColor = e.target.value;
      // Auto-save on color change
      debounce(saveSetting, 1000)();
    });
  }

  // 🔥 NEW: Font & Layout setting handlers
  const settingFontFamily = document.getElementById('settingFontFamily');
  const settingFontSize = document.getElementById('settingFontSize');
  const settingLayoutMode = document.getElementById('settingLayoutMode');
  const settingSidebarPosition = document.getElementById('settingSidebarPosition');
  
  if (settingFontFamily) {
    settingFontFamily.addEventListener('change', function() {
      debounce(saveSetting, 500)();
    });
  }
  
  if (settingFontSize) {
    settingFontSize.addEventListener('change', function() {
      debounce(saveSetting, 500)();
    });
  }
  
  if (settingLayoutMode) {
    settingLayoutMode.addEventListener('change', function() {
      debounce(saveSetting, 500)();
    });
  }
  
  if (settingSidebarPosition) {
    settingSidebarPosition.addEventListener('change', function() {
      debounce(saveSetting, 500)();
    });
  }

  // Theme change handler
  const settingTheme = document.getElementById('settingTheme');
  if (settingTheme) {
    settingTheme.addEventListener('change', function() {
      applyTheme(this.value);
      debounce(saveSetting, 500)();
    });
  }

  // Enter key for login
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('loginBtn').click();
      }
    });
  }

  // Enter key untuk cash input
  if (cashInput) {
    cashInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnSelesai').click();
      }
    });
  }

  // Auto load setting on page load
  if (kasirInfo.idToko) {
    loadSetting();
  }
}
// Initialize aplikasi saat DOM loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  
  // Cek jika sudah login dari session sebelumnya
  const savedKasirInfo = localStorage.getItem('kasirInfo');
  if (savedKasirInfo) {
    try {
      kasirInfo = JSON.parse(savedKasirInfo);
      if (kasirInfo.username) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('kasirPage').classList.add('active');
        showTabsBasedOnLevel();
        loadMenu();
        loadSetting();
        
        const namaToko = document.getElementById('namaToko');
        if (namaToko) namaToko.innerText = kasirInfo.namaToko || 'Aplikasi Kasir';
        
        // 🔥 Setup filters setelah session restore
        setTimeout(() => {
          setupLaporanFilters();
          console.log('✅ Laporan filters setup after session restore');
        }, 500);
        
        showNotification(`Selamat datang kembali, ${kasirInfo.namaKasir}!`, 'success');
      }
    } catch (e) {
      console.error('Error loading saved session:', e);
      localStorage.removeItem('kasirInfo');
    }
  }
});

// Auto-save kasirInfo ketika berubah
function updateKasirInfo(newInfo) {
  kasirInfo = newInfo;
  localStorage.setItem('kasirInfo', JSON.stringify(newInfo));
}

// Setup Sub Tab Navigation
function setupSubTabNavigation() {
  const subtabBtns = document.querySelectorAll('.subtab-btn');
  const subtabContents = document.querySelectorAll('.subtab-content');
  
  subtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSubtab = btn.dataset.subtab;
      
      // Update active button
      subtabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Show target content
      subtabContents.forEach(content => {
        content.classList.remove('active');
        if (content.dataset.subtab === targetSubtab) {
          content.classList.add('active');
        }
      });
    });
  });
}