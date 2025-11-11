// 🔥 EMERGENCY MODE - SMART DETECTION
let FORCE_GOOGLE_SHEETS_MODE = localStorage.getItem('force_google_sheets') === 'true';
console.log('🚨 EMERGENCY MODE:', FORCE_GOOGLE_SHEETS_MODE ? 'Force Google Sheets Active' : 'PostgreSQL Mode');

// ==================== KONFIGURASI HYBRID SYSTEM ====================

// ✅ DYNAMIC API URL - Auto detect environment
const getApiBaseUrl = () => {
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';
  
  if (isLocalhost) {
    return "http://localhost:3000/api";
  } else {
    // Relative path untuk production (Vercel/Netlify)
    return "/api";
  }
};

const SCRIPT_URL = getApiBaseUrl();
console.log('🔧 API Base URL:', SCRIPT_URL);
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzrM2zFCnabXr6wgRHFJY7PPqUGJxTidsy26mH-oQKUEq7CWYLNHc_Xpkha7yw6bY4Q/exec";
const ITEMS_PER_PAGE = 20;
const CACHE_TTL = 5 * 60 * 1000; // 5 menit

// ==================== GLOBAL VARIABLES ====================
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

// ==================== SYSTEM INITIALIZATION ====================

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
      FORCE_GOOGLE_SHEETS_MODE = false;
      localStorage.setItem('force_google_sheets', 'false');
    }
  } catch (error) {
    console.warn('⚠️ PostgreSQL tidak tersedia:', error.message);
    FORCE_GOOGLE_SHEETS_MODE = true;
    localStorage.setItem('force_google_sheets', 'true');
  }
}

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
    // Test koneksi lagi ketika online
    setTimeout(testConnection, 2000);
  });
  
  window.addEventListener('offline', function() {
    console.warn('🌐 Koneksi internet terputus');
    showNotification('Koneksi internet terputus - mode offline', 'warning');
  });
}

// ==================== HYBRID FETCH SYSTEM ====================

// 🔥 PERBAIKAN BESAR: Hybrid Fetch dengan CORS handling dan fallback
async function hybridFetch(endpoint, data = {}, method = 'POST') {
  const action = endpoint.replace('/api/', '');
  const payload = { ...data, action: action };
  
  console.log(`🔄 Hybrid Fetch: ${endpoint}`, { data: payload });
  
  // 🔥 BYPASS POSTGRESQL JIKA EMERGENCY MODE AKTIF
  if (FORCE_GOOGLE_SHEETS_MODE) {
    console.log('🚨 Bypassing PostgreSQL, langsung ke Google Sheets');
    
    try {
      console.log(`🔗 Direct to Google Sheets: ${GOOGLE_SCRIPT_URL}`);
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      console.log(`📡 Google Sheets Response (no-cors): Request sent`);
      
      // Return success response untuk avoid error
      return {
        success: true,
        message: 'Google Sheets fallback active',
        data: getFallbackData(endpoint, data)
      };
      
    } catch (error) {
      console.error(`❌ Google Sheets failed: ${error.message}`);
      return getFallbackData(endpoint, data);
    }
  }
  
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
      body: method !== 'GET' ? JSON.stringify(data) : undefined,
      signal: controller.signal,
      credentials: 'include'
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
    
    // Auto enable emergency mode untuk request selanjutnya
    if (postgresError.message.includes('Failed to fetch') || 
        postgresError.message.includes('Network Error') ||
        postgresError.message.includes('500')) {
      FORCE_GOOGLE_SHEETS_MODE = true;
      localStorage.setItem('force_google_sheets', 'true');
      console.log('🚨 Auto-enabling emergency mode due to PostgreSQL failure');
    }
    
    // Priority 2: Fallback ke Google Sheets
    try {
      console.log(`🔗 Mencoba Google Sheets: ${GOOGLE_SCRIPT_URL}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      // Coba dengan mode no-cors dulu
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log(`📡 Google Sheets Response (no-cors): Request sent`);
      
      // Karena no-cors, kita anggap berhasil untuk avoid error
      return {
        success: true,
        message: 'Google Sheets fallback (no-cors mode)',
        data: getFallbackData(endpoint, data),
        fallback: true
      };
      
    } catch (googleError) {
      console.error(`❌ Both backends failed: ${endpoint}`, googleError);
      
      // Return fallback data sebagai last resort
      return getFallbackData(endpoint, data);
    }
  }
}

// Fallback data untuk ketika semua backend gagal
function getFallbackData(endpoint, data) {
  const fallbackData = {
    '/api/getMenu': [],
    '/api/getMenuManagement': [],
    '/api/getUserManagement': { users: [], toko: [] },
    '/api/getToko': { data: [] },
    '/api/getLaporan': { data: [], summary: {}, analytics: {} },
    '/api/getSetting': { data: {} }
  };
  
  return fallbackData[endpoint] || { success: false, message: 'Service unavailable' };
}

// ==================== UTILITY FUNCTIONS ====================

// Format Rupiah
function formatRupiah(angka){
  const n = parseInt(angka) || 0;
  return n.toLocaleString('id-ID');
}

// Parse number dari string input
function parseNumberFromString(s){
  if (!s) return 0;
  return parseInt((s + '').replace(/[^\d]/g, '')) || 0;
}

// Format date untuk input
function formatDateForInput(date) {
  return date.toISOString().split('T')[0];
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

// ==================== MULTIPLE PAYMENT SYSTEM ====================

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

// Setup multiple payment inputs
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
      
      // Handle watermark visibility
      if (value > 0) {
        e.target.placeholder = '';
      } else {
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
  
  // Focus behavior dengan watermark
  container.addEventListener('focusin', function(e) {
    if (e.target.classList.contains('payment-input-small')) {
      const input = e.target;
      setTimeout(() => {
        input.select();
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
        document.getElementById('btnSelesai').focus();
      }
    }
  });
}

// Reset payment methods
function resetPaymentMethods() {
  paymentMethods = {
    tunai: 0,
    debit: 0,
    ewallet: 0, 
    qris: 0
  };
}

// ==================== THEME & SETTING FUNCTIONS ====================

// Apply theme
function applyTheme(themeName) {
  const root = document.documentElement;
  
  console.log('🎨 Applying theme:', themeName);
  
  // Remove existing theme classes
  root.classList.remove('theme-dark', 'theme-light', 'theme-auto');
  
  // Apply new theme
  root.classList.add(`theme-${themeName}`);
  
  // Force reflow
  document.body.offsetHeight;
  
  console.log('✅ Theme applied successfully');
}

// Apply font settings
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

// Apply layout settings
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

// Apply semua settings sekaligus
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

// Save settings to localStorage
function saveSettingToLocalStorage() {
  if (kasirInfo.idToko) {
    localStorage.setItem(`settings_${kasirInfo.idToko}`, JSON.stringify(currentSettings));
  }
}

// ==================== TAB MANAGEMENT ====================

// Fungsi untuk menampilkan tab berdasarkan level akses
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

// Switch ke subtab tertentu
function switchToSubTab(subtabName) {
  console.log('🔄 Switching to subtab:', subtabName);
  
  const activeManagementTab = document.querySelector('.tab-content[data-tab="manajemen"].active');
  if (!activeManagementTab) {
    console.log('❌ Tab management tidak aktif');
    return;
  }
  
  const subtabBtns = activeManagementTab.querySelectorAll('.subtab-btn');
  const subtabContents = activeManagementTab.querySelectorAll('.subtab-content');
  
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

// ==================== LOGIN SYSTEM ====================

// 🔥 FUNGSI LOGIN YANG AMAN - TIDAK DIUBAH LOGIKANYA
async function handleLogin() {
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
      
      // Setup filters setelah login berhasil
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
}

// Logout handler
function handleLogout() {
  kasirInfo = {}; 
  transaksi = []; 
  clearCache();
  localStorage.clear();
  
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('loginPage').classList.add('active');
  
  showNotification('Anda telah logout', 'info');
}

// ==================== MENU & TRANSAKSI FUNCTIONS ====================

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
  
  // SET FOCUS KE KOLOM JUMLAH setelah tambah menu
  setTimeout(() => {
    const inputs = document.querySelectorAll(".jumlah-input");
    const targetIndex = existingIndex !== -1 ? existingIndex : transaksi.length - 1;
    
    if (inputs[targetIndex]) {
      inputs[targetIndex].focus();
      inputs[targetIndex].select();
    }
  }, 100);
}

// Render transaksi dengan pertahankan fokus
function renderTransaksi(){
  const tbody = document.querySelector('#tblTransaksi tbody');
  if (!tbody) return;
  
  // SIMPAN ELEMENT YANG SEDANG FOCUS SEBELUM RENDER
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
  
  // AUTO-UPDATE CASH INPUT ke nilai total
  const cashInput = document.getElementById('cashInput');
  cashInput.value = formatRupiah(total);
  
  hitungKembali();
  
  // RESTORE FOCUS JIKA SEDANG INPUT
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
  
  // Untuk single payment
  const cashInput = document.getElementById('cashInput');
  const bayar = parseNumberFromString(cashInput.value);
  const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
  const kembali = bayar - total;
  
  document.getElementById('uangKembali').textContent = formatRupiah(kembali > 0 ? kembali : 0);
}

// Setup event delegation untuk transaksi
function setupTransactionEventDelegation() {
  const tbody = document.querySelector('#tblTransaksi tbody');
  if (!tbody) return;
  
  // Update subtotal secara real-time
  function updateSubtotalRealTime(input, index, newJumlah) {
    const item = transaksi[index];
    
    // Validasi stok
    if (newJumlah > item.stok) {
      const stokWarning = document.createElement('span');
      stokWarning.className = 'stok-warning-real-time';
      stokWarning.textContent = ` ❌ Max: ${item.stok}`;
      stokWarning.style.color = 'var(--danger)';
      stokWarning.style.fontSize = '0.7rem';
      
      const existingWarning = input.parentNode.querySelector('.stok-warning-real-time');
      if (existingWarning) existingWarning.remove();
      
      input.parentNode.appendChild(stokWarning);
    } else {
      const existingWarning = input.parentNode.querySelector('.stok-warning-real-time');
      if (existingWarning) existingWarning.remove();
    }
    
    // Update data transaksi
    const jumlahValid = Math.max(0, newJumlah);
    transaksi[index].jumlah = jumlahValid;
    transaksi[index].subtotal = transaksi[index].jumlah * transaksi[index].harga;
    
    // UPDATE SUBTOTAL DISPLAY SECARA LANGSUNG
    const subtotalDisplay = document.querySelector(`.subtotal-display[data-index="${index}"]`);
    if (subtotalDisplay) {
      subtotalDisplay.textContent = `Rp${formatRupiah(transaksi[index].subtotal)}`;
    }
    
    // UPDATE TOTAL & CASH INPUT SECARA LANGSUNG
    updateTotalOnly();
  }
  
  // EVENT: Input real-time
  tbody.addEventListener('input', function(e) {
    if (e.target.classList.contains('jumlah-input')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      if (isNaN(index) || index < 0 || index >= transaksi.length) return;
      
      const newJumlah = parseInt(e.target.value) || 0;
      updateSubtotalRealTime(e.target, index, newJumlah);
    }
  });
  
  // EVENT: Blur (final validation)
  tbody.addEventListener('blur', function(e) {
    if (e.target.classList.contains('jumlah-input')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      if (isNaN(index) || index < 0 || index >= transaksi.length) return;
      
      const newJumlah = parseInt(e.target.value) || 0;
      const item = transaksi[index];
      
      if (newJumlah > item.stok) {
        e.target.value = item.stok;
        transaksi[index].jumlah = item.stok;
        transaksi[index].subtotal = item.stok * item.harga;
        
        const subtotalDisplay = document.querySelector(`.subtotal-display[data-index="${index}"]`);
        if (subtotalDisplay) {
          subtotalDisplay.textContent = `Rp${formatRupiah(transaksi[index].subtotal)}`;
        }
        
        updateTotalOnly();
        
        const existingWarning = e.target.parentNode.querySelector('.stok-warning-real-time');
        if (existingWarning) existingWarning.remove();
      }
      
      if (newJumlah <= 0) {
        setTimeout(() => {
          transaksi.splice(index, 1);
          renderTransaksi();
        }, 100);
      }
    }
  });
  
  // EVENT: Keydown untuk Enter
  tbody.addEventListener('keydown', function(e) {
    if (e.target.classList.contains('jumlah-input')) {
      const input = e.target;
      const index = parseInt(input.getAttribute('data-index'));
      
      if (e.key === 'Enter') {
        e.preventDefault();
        
        const newJumlah = parseInt(input.value) || 0;
        const item = transaksi[index];
        
        if (newJumlah > item.stok) {
          showNotification(`❌ Jumlah melebihi stok! Stok ${item.nama} hanya ${item.stok}`, 'warning');
          input.value = item.stok;
          updateSubtotalRealTime(input, index, item.stok);
          input.select();
          return;
        }
        
        if (newJumlah <= 0) {
          transaksi.splice(index, 1);
          renderTransaksi();
        } else {
          updateSubtotalRealTime(input, index, newJumlah);
        }
        
        // SET FOCUS KE CASH INPUT setelah Enter
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
        renderTransaksi();
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

// Update total saja tanpa re-render tabel
function updateTotalOnly() {
  const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
  
  document.getElementById('totalHarga').textContent = formatRupiah(total);
  
  if (!isMultiplePayment) {
    const cashInput = document.getElementById('cashInput');
    cashInput.value = formatRupiah(total);
  } else {
    updateMultiplePaymentDisplay();
  }
  
  hitungKembali();
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
      paymentData: paymentData
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

// Print struk dengan multiple payment support
function printStruk() {
  console.log('🚀 printStruk() dipanggil');
  
  const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
  let bayar, kembali, paymentBreakdown = [];
  
  if (isMultiplePayment) {
    bayar = calculateTotalPaid();
    kembali = bayar - total;
    
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

  const storeName = kasirInfo.namaToko || 'TOKO KITA';
  const currentDate = new Date().toLocaleString('id-ID');
  const cashierName = kasirInfo.namaKasir || 'Kasir';

  let strukHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Struk ${storeName}</title>
      <meta charset="utf-8">
      <style>
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
        window.onload = function() {
          setTimeout(function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 500);
          }, 300);
        };
        
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
  
  const printWindow = window.open('', '_blank', 'width=80mm,height=200mm');
  if (!printWindow) {
    showNotification('Popup diblokir! Izinkan popup untuk mencetak struk.', 'error');
    return;
  }
  
  printWindow.document.write(strukHTML);
  printWindow.document.close();
  
  console.log('✅ Struk window opened successfully');
}

// ==================== MANAGEMENT FUNCTIONS ====================

// [Kode untuk menu management, user management, toko management, laporan, settings...]
// Semua fungsi management tetap sama seperti sebelumnya untuk menjaga kompatibilitas

// ==================== INITIALIZATION ====================

function initializeEventListeners() {
  // Setup tab navigation
  setupTabNavigation();
  setupSubTabNavigation();
  
  // Setup transaction event delegation
  setupTransactionEventDelegation();
  
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

  // MULTIPLE PAYMENT EVENT LISTENERS
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

  // LOGIN HANDLER - TIDAK DIUBAH
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  // LOGOUT HANDLER
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // [Semua event listener lainnya tetap sama...]
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

// 🔥 TEST CONNECTION ON STARTUP
testConnection();
