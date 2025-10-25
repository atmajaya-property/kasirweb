// KONFIGURASI
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzrM2zFCnabXr6wgRHFJY7PPqUGJxTidsy26mH-oQKUEq7CWYLNHc_Xpkha7yw6bY4Q/exec";
const ITEMS_PER_PAGE = 20;

// Global Variables
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

// 🔥 PERBAIKAN: Fungsi untuk menampilkan tab berdasarkan level akses
function showTabsBasedOnLevel() {
  if (!kasirInfo || !kasirInfo.levelAkses) return;
  
  const level = kasirInfo.levelAkses;
  console.log('Level Akses:', level);
  
  // Sembunyikan semua tab management dulu
  const tabManajemen = document.getElementById('tabManajemen');
  const tabToko = document.getElementById('tabToko');
  const tabUser = document.getElementById('tabUser');
  const tabSetting = document.getElementById('tabSetting');
  
  if (tabManajemen) tabManajemen.style.display = 'none';
  if (tabToko) tabToko.style.display = 'none';
  if (tabUser) tabUser.style.display = 'none';
  if (tabSetting) tabSetting.style.display = 'none';
  
  // Tampilkan tab berdasarkan level
  if (level === 'OWNER') {
    if (tabManajemen) tabManajemen.style.display = 'block';
    if (tabToko) tabToko.style.display = 'block';
    if (tabUser) tabUser.style.display = 'block';
    if (tabSetting) tabSetting.style.display = 'block';
  } else if (level === 'ADMIN') {
    if (tabManajemen) tabManajemen.style.display = 'block';
    if (tabUser) tabUser.style.display = 'block';
  }
}

// Navigation between tabs
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show target content, hide others
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.dataset.tab === targetTab) {
          content.classList.add('active');
        }
      });
      
      // Load data if needed
      if (targetTab === 'laporan') {
        loadLaporan();
      } else if (targetTab === 'manajemen') {
        loadMenuManagement();
      } else if (targetTab === 'user') {
        loadUserManagement();
      } else if (targetTab === 'toko') {
        loadUserManagement(); // Load toko data
      } else if (targetTab === 'setting') {
        loadSetting();
      }
    });
  });
}

// ==================== USER MANAGEMENT FUNCTIONS ====================

// Load data untuk management user
async function loadUserManagement() {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'getUserManagement',
        idToko: kasirInfo.idToko,
        levelAkses: kasirInfo.levelAkses,
        username: kasirInfo.username
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      userManagementData = data.users || [];
      tokoManagementData = data.toko || [];
      renderUserManagementList();
      renderTokoManagementList();
      populateTokoDropdowns();
      
      // PERBAIKAN: Pastikan tab tetap tampil sesuai level
      showTabsBasedOnLevel();
    } else {
      userManagementData = [];
      tokoManagementData = [];
      renderUserManagementList();
      renderTokoManagementList();
    }
  } catch (err) {
    console.error('Error loadUserManagement:', err);
    userManagementData = [];
    tokoManagementData = [];
    renderUserManagementList();
    renderTokoManagementList();
  }
}

// Render daftar user
function renderUserManagementList(filteredData = userManagementData) {
  const tbody = document.getElementById('daftarUserBody');
  tbody.innerHTML = '';
  
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
  
  filteredData.forEach(user => {
    const tr = document.createElement('tr');
    
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
    tbody.appendChild(tr);
  });
  
  // Add event listeners
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

// Render daftar toko
function renderTokoManagementList(filteredData = tokoManagementData) {
  const tbody = document.getElementById('daftarTokoBody');
  tbody.innerHTML = '';
  
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
    tbody.appendChild(tr);
  });
  
  // Add event listeners untuk toko
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
function populateTokoDropdowns() {
  const userTokoSelect = document.getElementById('inputTokoUser');
  
  if (userTokoSelect) {
    userTokoSelect.innerHTML = '<option value="">Pilih Toko</option>';
    tokoManagementData.forEach(toko => {
      if (toko.status === 'Aktif') {
        const option = document.createElement('option');
        option.value = toko.id_toko;
        option.textContent = `${toko.id_toko} - ${toko.nama_toko}`;
        userTokoSelect.appendChild(option);
      }
    });
    
    // Tambah option ALL untuk Owner
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
  if (kasirInfo.levelAkses === 'ADMIN' && user.id_toko === kasirInfo.idToko) return true;
  return false;
}

function canDeleteUser(user) {
  if (user.username === kasirInfo.username) return false; // Tidak bisa hapus diri sendiri
  if (kasirInfo.levelAkses === 'OWNER') return true;
  if (kasirInfo.levelAkses === 'ADMIN' && user.level_akses === 'KASIR' && user.id_toko === kasirInfo.idToko) return true;
  return false;
}

function canResetPassword(user) {
  if (kasirInfo.levelAkses === 'OWNER') return true;
  if (kasirInfo.levelAkses === 'ADMIN' && user.id_toko === kasirInfo.idToko) return true;
  if (user.username === kasirInfo.username) return true; // Bisa reset password sendiri
  return false;
}

function canCreateUser() {
  return kasirInfo.levelAkses === 'OWNER' || kasirInfo.levelAkses === 'ADMIN';
}

function canEditToko() {
  return kasirInfo.levelAkses === 'OWNER';
}

function canDeleteToko() {
  return kasirInfo.levelAkses === 'OWNER';
}

function canCreateToko() {
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

// Batal edit user
function cancelEditUser() {
  editingUserId = null;
  clearUserForm();
  document.getElementById('btnSimpanUser').textContent = '💾 Simpan User';
  document.getElementById('btnBatalEditUser').style.display = 'none';
}

// Batal edit toko
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
  document.getElementById('inputRoleUser').value = 'KASIR';
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
  if (!confirm(`Apakah Anda yakin ingin menghapus user ${username}?`)) {
    return;
  }
  
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'deleteUser',
        username: username,
        idToko: kasirInfo.idToko,
        levelAkses: kasirInfo.levelAkses
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      alert('User berhasil dihapus');
      loadUserManagement();
    } else {
      alert('Gagal menghapus user: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Gagal menghapus user: ' + err.message);
  }
}

// Delete toko
async function deleteToko(tokoId) {
  if (!confirm(`Apakah Anda yakin ingin menghapus toko ${tokoId}?`)) {
    return;
  }
  
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'deleteToko',
        idToko: tokoId,
        levelAkses: kasirInfo.levelAkses
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      alert('Toko berhasil dihapus');
      loadUserManagement();
    } else {
      alert('Gagal menghapus toko: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Gagal menghapus toko: ' + err.message);
  }
}

// Reset password user
async function resetPasswordUser(username) {
  const newPassword = prompt(`Reset password untuk ${username}\nMasukkan password baru:`);
  
  if (!newPassword || newPassword.length < 4) {
    alert('Password harus minimal 4 karakter');
    return;
  }
  
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'resetPassword',
        username: username,
        newPassword: newPassword,
        idToko: kasirInfo.idToko,
        levelAkses: kasirInfo.levelAkses
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      alert('Password berhasil direset');
    } else {
      alert('Gagal reset password: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Gagal reset password: ' + err.message);
  }
}

// Simpan user
async function saveUser() {
  const username = document.getElementById('inputUsername').value.trim();
  const password = document.getElementById('inputPassword').value;
  const namaUser = document.getElementById('inputNamaUser').value.trim();
  const toko = document.getElementById('inputTokoUser').value;
  const levelAkses = document.getElementById('inputRoleUser').value;
  const status = document.getElementById('inputStatusUser').value;
  
  // Validasi
  if (!username) {
    alert('Username harus diisi');
    return;
  }
  if (!editingUserId && !password) {
    alert('Password harus diisi untuk user baru');
    return;
  }
  if (!namaUser) {
    alert('Nama user harus diisi');
    return;
  }
  if (!toko) {
    alert('Toko harus dipilih');
    return;
  }
  
  try {
    const action = editingUserId ? 'updateUser' : 'createUser';
    const payload = {
      action: action,
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
    
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data && data.success) {
      alert(editingUserId ? 'User berhasil diupdate' : 'User berhasil ditambahkan');
      clearUserForm();
      cancelEditUser();
      loadUserManagement();
    } else {
      alert('Gagal menyimpan user: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Gagal menyimpan user: ' + err.message);
  }
}

// Simpan toko
async function saveToko() {
  const tokoId = document.getElementById('inputIdToko').value.trim();
  const namaToko = document.getElementById('inputNamaToko').value.trim();
  const alamat = document.getElementById('inputAlamatToko').value.trim();
  const telepon = document.getElementById('inputTeleponToko').value.trim();
  const status = document.getElementById('inputStatusToko').value;
  
  // Validasi
  if (!tokoId) {
    alert('ID Toko harus diisi');
    return;
  }
  if (!namaToko) {
    alert('Nama toko harus diisi');
    return;
  }
  
  try {
    const action = editingTokoId ? 'updateToko' : 'createToko';
    const payload = {
      action: action,
      idToko: tokoId,
      namaToko: namaToko,
      alamat: alamat,
      telepon: telepon,
      status: status,
      levelAkses: kasirInfo.levelAkses
    };
    
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data && data.success) {
      alert(editingTokoId ? 'Toko berhasil diupdate' : 'Toko berhasil ditambahkan');
      clearTokoForm();
      cancelEditToko();
      loadUserManagement();
    } else {
      alert('Gagal menyimpan toko: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Gagal menyimpan toko: ' + err.message);
  }
}

// Search user
function setupUserManagementSearch() {
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
}

// ==================== MENU MANAGEMENT FUNCTIONS - DIPERBAIKI ====================

// 🔥 PERBAIKAN: Load data toko untuk dropdown management menu (khusus Owner)
async function loadTokoForMenuManagement() {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'getToko',
        levelAkses: kasirInfo.levelAkses
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      populateTokoDropdownForMenu(data.data);
    }
  } catch (err) {
    console.error('Error load toko for menu:', err);
  }
}

// 🔥 PERBAIKAN: Populate dropdown toko untuk menu management
function populateTokoDropdownForMenu(tokoData) {
  const tokoSelect = document.getElementById('inputToko');
  if (!tokoSelect) return;
  
  // Simpan opsi default
  const defaultOptions = tokoSelect.innerHTML;
  tokoSelect.innerHTML = defaultOptions;
  
  // Tambah opsi toko khusus untuk Owner
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

// 🔥 PERBAIKAN: Load data untuk management menu dengan improvements
async function loadMenuManagement() {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'getMenuManagement',
        idToko: kasirInfo.idToko,
        levelAkses: kasirInfo.levelAkses
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      menuManagementData = data.data || [];
      renderMenuManagementList();
      
      // PERBAIKAN: Load data toko untuk dropdown (khusus Owner)
      if (kasirInfo.levelAkses === 'OWNER') {
        await loadTokoForMenuManagement();
      }
      
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

// Render daftar menu di management
function renderMenuManagementList(filteredData = menuManagementData) {
  const tbody = document.getElementById('daftarMenuBody');
  tbody.innerHTML = '';
  
  if (!filteredData || filteredData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:20px;color:var(--muted)">
          Tidak ada data menu
        </td>
      </tr>
    `;
    return;
  }
  
  filteredData.forEach(menu => {
    const tr = document.createElement('tr');
    const stokClass = menu.stok <= 0 ? 'stok-danger' : (menu.stok < 10 ? 'stok-warning' : '');
    
    tr.innerHTML = `
      <td>${menu.id_menu}</td>
      <td><strong>${menu.nama_menu}</strong></td>
      <td>${menu.kategori}</td>
      <td>Rp${formatRupiah(menu.harga)}</td>
      <td class="${stokClass}">${menu.stok}</td>
      <td>${menu.id_toko === 'ALL' ? '🌍 Semua Toko' : menu.id_toko}</td>
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

// PERBAIKAN: Cek duplikat nama menu
function isMenuNameDuplicate(namaMenu, excludeId = null) {
  return menuManagementData.some(menu => 
    menu.nama_menu.toLowerCase() === namaMenu.toLowerCase() && 
    menu.id_menu !== excludeId
  );
}

// Edit menu
function editMenu(menuId) {
  const menu = menuManagementData.find(m => m.id_menu === menuId);
  if (!menu) return;
  
  editingMenuId = menuId;
  
  // Isi form dengan data menu
  document.getElementById('inputNamaMenu').value = menu.nama_menu;
  document.getElementById('inputKategori').value = menu.kategori;
  document.getElementById('inputHarga').value = menu.harga;
  document.getElementById('inputStok').value = menu.stok || 0;
  document.getElementById('inputToko').value = menu.id_toko;
  
  // Update UI untuk mode edit
  document.getElementById('btnSimpanMenu').textContent = '💾 Update Menu';
  document.getElementById('btnBatalEdit').style.display = 'inline-block';
  document.getElementById('menuIdDisplay').textContent = `Editing: ${menuId}`;
  
  // Scroll ke form
  document.querySelector('.form-menu').scrollIntoView({ behavior: 'smooth' });
}

// Batal edit menu
function cancelEdit() {
  editingMenuId = null;
  clearMenuForm();
  document.getElementById('btnSimpanMenu').textContent = '💾 Simpan Menu';
  document.getElementById('btnBatalEdit').style.display = 'none';
  document.getElementById('menuIdDisplay').textContent = '';
}

// Clear form menu
function clearMenuForm() {
  document.getElementById('inputNamaMenu').value = '';
  document.getElementById('inputKategori').value = '';
  document.getElementById('inputHarga').value = '';
  document.getElementById('inputStok').value = '0';
  document.getElementById('inputToko').value = 'current';
  
  // Hapus pesan error duplikat
  const errorMsg = document.getElementById('duplicateError');
  if (errorMsg) errorMsg.remove();
}

// Delete menu
async function deleteMenu(menuId) {
  if (!confirm(`Apakah Anda yakin ingin menghapus menu ${menuId}?`)) {
    return;
  }
  
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'deleteMenu',
        idMenu: menuId,
        idToko: kasirInfo.idToko,
        levelAkses: kasirInfo.levelAkses
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      alert('Menu berhasil dihapus');
      loadMenuManagement();
      loadMenu();
    } else {
      alert('Gagal menghapus menu: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Gagal menghapus menu: ' + err.message);
  }
}

// PERBAIKAN: Simpan menu dengan validasi duplikat nama
async function saveMenu() {
  const namaMenu = document.getElementById('inputNamaMenu').value.trim();
  const kategori = document.getElementById('inputKategori').value;
  const harga = parseInt(document.getElementById('inputHarga').value) || 0;
  const stok = parseInt(document.getElementById('inputStok').value) || 0;
  const toko = document.getElementById('inputToko').value;
  const idToko = toko === 'current' ? kasirInfo.idToko : toko;
  
  // Validasi
  if (!namaMenu) {
    alert('Nama menu harus diisi');
    return;
  }
  if (!kategori) {
    alert('Kategori harus dipilih');
    return;
  }
  if (harga <= 0) {
    alert('Harga harus lebih dari 0');
    return;
  }
  
  // PERBAIKAN: Cek duplikat nama menu
  if (isMenuNameDuplicate(namaMenu, editingMenuId)) {
    const existingError = document.getElementById('duplicateError');
    if (existingError) existingError.remove();
    
    const errorMsg = document.createElement('div');
    errorMsg.id = 'duplicateError';
    errorMsg.style.color = 'var(--danger)';
    errorMsg.style.fontSize = '0.8rem';
    errorMsg.style.marginTop = '5px';
    errorMsg.innerHTML = '⚠️ Nama menu sudah ada! Gunakan nama yang berbeda.';
    
    document.getElementById('inputNamaMenu').parentNode.appendChild(errorMsg);
    return;
  }
  
  try {
    const action = editingMenuId ? 'updateMenu' : 'createMenu';
    const payload = {
      action: action,
      idToko: kasirInfo.idToko,
      namaMenu: namaMenu,
      kategori: kategori,
      harga: harga,
      stok: stok,
      targetToko: idToko,
      levelAkses: kasirInfo.levelAkses
    };
    
    if (editingMenuId) {
      payload.idMenu = editingMenuId;
    }
    
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data && data.success) {
      alert(editingMenuId ? 'Menu berhasil diupdate' : 'Menu berhasil ditambahkan');
      clearMenuForm();
      cancelEdit();
      loadMenuManagement();
      loadMenu();
    } else {
      alert('Gagal menyimpan menu: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Gagal menyimpan menu: ' + err.message);
  }
}

// Search menu di management
function setupMenuManagementSearch() {
  const searchInput = document.getElementById('searchMenuManagement');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      
      if (!searchTerm) {
        renderMenuManagementList(menuManagementData);
        return;
      }
      
      const filtered = menuManagementData.filter(menu => 
        menu.nama_menu.toLowerCase().includes(searchTerm) ||
        menu.kategori.toLowerCase().includes(searchTerm) ||
        menu.id_menu.toLowerCase().includes(searchTerm)
      );
      
      renderMenuManagementList(filtered);
    });
  }
}

// ==================== TRANSAKSI FUNCTIONS (DIPERBAIKI) ====================

// PERBAIKAN: Load menu dengan data stok untuk transaksi
async function loadMenu(){
  const spinner = document.getElementById('menuLoading');
  if (spinner) spinner.style.display = 'flex';
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'getMenuManagement', 
        idToko: kasirInfo.idToko,
        levelAkses: kasirInfo.levelAkses
      })
    });
    const data = await res.json();
    
    if (data && data.success && Array.isArray(data.data)) {
      menuData = data.data.map((m, index) => {
        return {
          id: m.id_menu,
          nama: m.nama_menu,
          harga: m.harga,
          kategori: m.kategori,
          stok: m.stok || 0
        };
      });
      
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

// PERBAIKAN: Render menu dengan tampilan stok
function renderMenuList(items = filteredMenu){
  const list = document.getElementById('menuList');
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

  itemsToShow.forEach(m => {
    const btn = document.createElement('button');
    const hargaNum = m.harga;
    const stok = m.stok || 0;
    
    // Tentukan style berdasarkan stok
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
    
    // Nonaktifkan tombol jika stok habis
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
    
    list.appendChild(btn);
  });

  updatePaginationInfo(items.length, totalPages);
}

function updatePaginationInfo(totalItems, totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)) {
  const pageInfo = document.getElementById('pageInfo');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  
  pageInfo.textContent = `Hal ${currentPage}/${totalPages}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages || totalPages === 0;
}

function goToPage(page) {
  currentPage = page;
  renderMenuList();
}

// Filter pencarian
function filterMenuByText(text){
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
}

// PERBAIKAN: Tambah menu dengan cek stok dan cegah duplikat
function tambahMenu(menu){
  // Cek stok tersedia
  const stokTersedia = menu.stok || 0;
  const existingIndex = transaksi.findIndex(t => t.id === menu.id);
  
  if (existingIndex !== -1) {
    // Jika menu sudah ada, cek stok untuk penambahan
    const jumlahSekarang = transaksi[existingIndex].jumlah;
    if (jumlahSekarang + 1 > stokTersedia) {
      alert(`❌ Stok tidak cukup! Stok ${menu.nama} hanya ${stokTersedia}`);
      return;
    }
    
    transaksi[existingIndex].jumlah += 1;
    transaksi[existingIndex].subtotal = transaksi[existingIndex].jumlah * transaksi[existingIndex].harga;
  } else {
    // Jika menu belum ada, tambah sebagai item baru
    if (stokTersedia < 1) {
      alert(`❌ Stok ${menu.nama} habis!`);
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
  
  // Set focus ke input jumlah item yang baru/tambah
  setTimeout(() => {
    const inputs = document.querySelectorAll(".jumlah-input");
    const targetIndex = existingIndex !== -1 ? existingIndex : transaksi.length - 1;
    
    if (inputs[targetIndex]) {
      inputs[targetIndex].focus();
      inputs[targetIndex].select();
    }
  }, 100);
}

// PERBAIKAN: Render transaksi dengan info stok
function renderTransaksi(){
  const tbody = document.querySelector('#tblTransaksi tbody');
  tbody.innerHTML = '';
  let total = 0;
  
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
      <td><input type="number" min="0" value="${item.jumlah}" data-index="${i}" class="jumlah-input"></td>
      <td><strong>Rp${formatRupiah(item.subtotal)}</strong></td>
      <td><button class="hapus-btn" data-index="${i}" title="Hapus item">❌</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('totalHarga').textContent = formatRupiah(total);
  
  // Auto-fill bayar dengan total
  const cashInput = document.getElementById('cashInput');
  if (total > 0) {
    cashInput.value = formatRupiah(total);
  } else {
    cashInput.value = '0';
  }
  hitungKembali();
}

// Hitung kembalian
function hitungKembali() {
  const cashInput = document.getElementById('cashInput');
  const bayar = parseNumberFromString(cashInput.value);
  const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
  const kembali = bayar - total;
  
  document.getElementById('uangKembali').textContent = formatRupiah(kembali > 0 ? kembali : 0);
}

// PERBAIKAN: Setup event delegation dengan validasi stok
function setupTransactionEventDelegation() {
  const tbody = document.querySelector('#tblTransaksi tbody');
  
  if (!tbody) return;
  
  // Event delegation untuk input jumlah
  tbody.addEventListener('input', function(e) {
    if (e.target.classList.contains('jumlah-input')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      if (isNaN(index) || index < 0 || index >= transaksi.length) return;
      
      const newJumlah = parseInt(e.target.value) || 0;
      const item = transaksi[index];
      
      // PERBAIKAN: Validasi stok
      if (newJumlah > item.stok) {
        alert(`❌ Jumlah melebihi stok! Stok ${item.nama} hanya ${item.stok}`);
        e.target.value = item.stok;
        return;
      }
      
      // Jika jumlah = 0, hapus item dari transaksi
      if (newJumlah <= 0) {
        transaksi.splice(index, 1);
      } else {
        transaksi[index].jumlah = newJumlah;
        transaksi[index].subtotal = transaksi[index].jumlah * transaksi[index].harga;
      }
      renderTransaksi();
    }
  });
  
  // Event delegation untuk tombol hapus
  tbody.addEventListener('click', function(e) {
    if (e.target.classList.contains('hapus-btn')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      if (!isNaN(index) && index >= 0 && index < transaksi.length) {
        transaksi.splice(index, 1);
        renderTransaksi();
      }
    }
  });
  
  // Focus handling untuk input jumlah
  tbody.addEventListener('focusin', function(e) {
    if (e.target.classList.contains('jumlah-input')) {
      setTimeout(() => e.target.select(), 10);
    }
  });
  
  // Enter key untuk pindah ke cash input
  tbody.addEventListener('keydown', function(e) {
    if (e.target.classList.contains('jumlah-input') && e.key === 'Enter') {
      e.preventDefault();
      
      const index = parseInt(e.target.getAttribute('data-index'));
      const newJumlah = parseInt(e.target.value) || 0;
      const item = transaksi[index];
      
      // Validasi stok sebelum pindah
      if (newJumlah > item.stok) {
        alert(`❌ Jumlah melebihi stok! Stok ${item.nama} hanya ${item.stok}`);
        e.target.value = item.stok;
        return;
      }
      
      // Update jumlah dulu
      if (newJumlah <= 0) {
        transaksi.splice(index, 1);
      } else {
        transaksi[index].jumlah = newJumlah;
        transaksi[index].subtotal = transaksi[index].jumlah * transaksi[index].harga;
      }
      
      renderTransaksi();
      
      // Set focus ke cash input setelah render
      setTimeout(() => {
        const cashInput = document.getElementById('cashInput');
        if (cashInput) {
          cashInput.focus();
          cashInput.select();
        }
      }, 50);
    }
  });
}

// ==================== LAPORAN FUNCTIONS ====================

// Load laporan dengan filter tanggal
async function loadLaporan() {
  try {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    console.log("Loading laporan dengan filter:", { startDate, endDate, idToko: kasirInfo.idToko });
    
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'getLaporan',
        startDate: startDate,
        endDate: endDate,
        idToko: kasirInfo.idToko,
        levelAkses: kasirInfo.levelAkses
      })
    });
    
    const data = await res.json();
    console.log("Response laporan:", data);
    
    if (data && data.success) {
      laporanData = data.data || [];
      renderLaporan(laporanData, data.summary);
    } else {
      alert('Gagal memuat laporan: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    console.error('Error loadLaporan:', err);
    alert('Gagal memuat laporan: ' + err.message);
  }
}

// Render laporan
function renderLaporan(data, summary) {
  const tbody = document.getElementById('laporanBody');
  tbody.innerHTML = '';
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--muted)">Tidak ada data laporan</td></tr>';
  } else {
    data.forEach(item => {
      const tr = document.createElement('tr');
      
      const tanggal = item.tanggal || '';
      const id_transaksi = item.id_transaksi || '';
      const kasir = item.kasir || '';
      const total = Number(item.total) || 0;
      const bayar = Number(item.bayar) || 0;
      const kembali = Number(item.kembali) || 0;
      const status = item.status || '';
      
      tr.innerHTML = `
        <td>${tanggal}</td>
        <td>${id_transaksi}</td>
        <td>${kasir}</td>
        <td>Rp${formatRupiah(total)}</td>
        <td>Rp${formatRupiah(bayar)}</td>
        <td>Rp${formatRupiah(kembali)}</td>
        <td><span style="color:${status === 'SUKSES' ? '#4caf50' : '#ff6b6b'}">${status}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  renderSummary(summary);
}

function renderSummary(summary) {
  const summaryContainer = document.getElementById('laporanSummary');
  if (!summary) {
    summaryContainer.innerHTML = '';
    return;
  }
  
  summaryContainer.innerHTML = `
    <div class="summary-card">
      <h3>Total Transaksi</h3>
      <div class="value">${summary.totalTransaksi || 0}</div>
    </div>
    <div class="summary-card">
      <h3>Total Pendapatan</h3>
      <div class="value">Rp${formatRupiah(summary.totalPendapatan || 0)}</div>
    </div>
    <div class="summary-card">
      <h3>Total Bayar</h3>
      <div class="value">Rp${formatRupiah(summary.totalBayar || 0)}</div>
    </div>
    <div class="summary-card">
      <h3>Total Kembali</h3>
      <div class="value">Rp${formatRupiah(summary.totalKembali || 0)}</div>
    </div>
  `;
}

// Reset filter laporan
function resetFilterLaporan() {
  document.getElementById('startDate').value = '';
  document.getElementById('endDate').value = '';
  document.getElementById('filterKasir').value = '';
  
  // Kosongkan data laporan
  laporanData = [];
  document.getElementById('laporanBody').innerHTML = '';
  document.getElementById('laporanSummary').innerHTML = '';
}

// Export laporan PDF
function exportLaporanPDF() {
  if (laporanData.length === 0) {
    alert('Tidak ada data laporan untuk di-export');
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
        <td>Rp${formatRupiah(item.total || 0)}</td>
        <td>Rp${formatRupiah(item.bayar || 0)}</td>
        <td>Rp${formatRupiah(item.kembali || 0)}</td>
        <td>${item.status || ''}</td>
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
            <th>Total</th>
            <th>Bayar</th>
            <th>Kembali</th>
            <th>Status</th>
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

// ==================== SETTING FUNCTIONS - DIPERBAIKI ====================

async function loadSetting() {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'getSetting' })
    });
    
    const data = await res.json();
    if (data && data.success) {
      currentSettings = data.data || {};
      renderSetting(currentSettings);
    }
  } catch (err) {
    console.error('Error loadSetting:', err);
  }
}

function renderSetting(settings) {
  document.getElementById('settingTheme').value = settings.Theme || 'dark';
  document.getElementById('settingAccentColor').value = settings.Warna_Aksen || '#14ffec';
  document.getElementById('settingAccentDark').value = settings.Warna_Aksen_Dark || '#0d7377';
  document.getElementById('settingAppName').value = settings.Nama_Aplikasi || 'KASIR WEB';
  document.getElementById('settingStrukFooter').value = settings.Footer_Struk || 'Terima Kasih';
  
  document.getElementById('accentPreview').style.backgroundColor = settings.Warna_Aksen || '#14ffec';
  document.getElementById('accentDarkPreview').style.backgroundColor = settings.Warna_Aksen_Dark || '#0d7377';
}

// 🔥 PERBAIKAN: Save setting dengan permission check
async function saveSetting() {
  try {
    // Validasi permission - hanya OWNER yang bisa edit setting
    if (kasirInfo.levelAkses !== 'OWNER') {
      alert('❌ Hanya OWNER yang bisa mengedit setting!');
      return;
    }
    
    const settings = {
      Theme: document.getElementById('settingTheme').value,
      Warna_Aksen: document.getElementById('settingAccentColor').value,
      Warna_Aksen_Dark: document.getElementById('settingAccentDark').value,
      Nama_Aplikasi: document.getElementById('settingAppName').value,
      Footer_Struk: document.getElementById('settingStrukFooter').value
    };
    
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'updateSetting',
        settings: settings,
        levelAkses: kasirInfo.levelAkses // Kirim level akses untuk validasi di backend
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      alert('✅ Setting berhasil disimpan!');
      applyThemeSettings(settings);
    } else {
      alert('❌ Gagal menyimpan setting: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('❌ Gagal menyimpan setting: ' + err.message);
  }
}

function applyThemeSettings(settings) {
  document.documentElement.style.setProperty('--accent', settings.Warna_Aksen || '#14ffec');
  document.documentElement.style.setProperty('--accent-dark', settings.Warna_Aksen_Dark || '#0d7377');
  document.title = settings.Nama_Aplikasi || 'KASIR WEB';
}

function resetSetting() {
  // Validasi permission - hanya OWNER yang bisa reset setting
  if (kasirInfo.levelAkses !== 'OWNER') {
    alert('❌ Hanya OWNER yang bisa reset setting!');
    return;
  }
  
  const defaultSettings = {
    Theme: 'dark',
    Warna_Aksen: '#14ffec',
    Warna_Aksen_Dark: '#0d7377',
    Nama_Aplikasi: 'KASIR WEB',
    Footer_Struk: 'Terima Kasih'
  };
  renderSetting(defaultSettings);
}

// ==================== TRANSAKSI & PRINT ====================

// PRINT STRUK
function printStruk() {
  const total = transaksi.reduce((s, it) => s + it.subtotal, 0);
  const bayar = parseNumberFromString(document.getElementById('cashInput').value);
  const kembali = bayar - total;
  
  document.getElementById('strukStoreName').textContent = kasirInfo.namaToko || 'TOKO KITA';
  document.getElementById('strukDate').textContent = new Date().toLocaleString('id-ID');
  
  const strukItems = document.getElementById('strukItems');
  strukItems.innerHTML = '';
  transaksi.forEach(item => {
    const tr = document.createElement('tr');
    const nama = item.nama.length > 20 ? item.nama.substring(0, 20) + '...' : item.nama;
    tr.innerHTML = `
      <td>${nama} (${item.jumlah})</td>
      <td>${formatRupiah(item.harga)}</td>
      <td>${formatRupiah(item.subtotal)}</td>
    `;
    strukItems.appendChild(tr);
  });
  
  const strukTotals = document.getElementById('strukTotals');
  strukTotals.innerHTML = `
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
  `;
  
  document.getElementById('strukContainer').style.display = 'block';
  
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.getElementById('strukContainer').style.display = 'none';
    }, 100);
  }, 500);
}

// PERBAIKAN: Selesaikan transaksi dengan update stok
async function selesaikanTransaksi() {
  if (!transaksi.length) {
    alert('Belum ada pesanan');
    return;
  }
  
  const cashEl = document.getElementById('cashInput');
  const total = transaksi.reduce((s,it) => s + it.subtotal, 0);
  const bayar = parseNumberFromString(cashEl.value);
  
  if (bayar < total) {
    alert('Jumlah bayar tunai kurang dari total!');
    return;
  }
  
  // PERBAIKAN: Validasi stok sebelum transaksi
  for (const item of transaksi) {
    if (item.jumlah > item.stok) {
      alert(`❌ Transaksi gagal! Jumlah ${item.nama} melebihi stok yang tersedia (${item.stok})`);
      return;
    }
  }
  
  const konfirmasi = confirm(`Total: Rp ${formatRupiah(total)}\nBayar: Rp ${formatRupiah(bayar)}\nKembali: Rp ${formatRupiah(bayar - total)}\n\nLanjutkan transaksi?`);
  
  if (!konfirmasi) return;
  
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveTransaksi',
        transaksi: transaksi,
        total: total,
        idToko: kasirInfo.idToko,
        kasir: kasirInfo.namaKasir || 'Kasir',
        bayar: bayar, 
        kembali: bayar - total
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      printStruk();
      
      // PERBAIKAN: Reload menu untuk update stok
      setTimeout(() => {
        transaksi = [];
        renderTransaksi();
        cashEl.value = '0';
        document.getElementById('uangKembali').textContent = '0';
        loadMenu(); // Reload menu untuk update stok di tampilan
        alert('Transaksi berhasil disimpan!');
      }, 1000);
      
    } else {
      alert('Gagal simpan transaksi');
    }
  } catch(err) {
    alert('Gagal mengirim data ke server');
  }
}

// ==================== MAIN EVENT LISTENERS ====================

// Setup event handlers
document.addEventListener('DOMContentLoaded', () => {
  // Setup tab navigation
  setupTabNavigation();
  
  // Setup transaction event delegation
  setupTransactionEventDelegation();
  
  // Setup menu management search
  setupMenuManagementSearch();
  
  // Setup user management search
  setupUserManagementSearch();
  
  // Set default dates for laporan
  const today = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(today.getDate() - 7);
  
  document.getElementById('startDate').value = formatDateForInput(oneWeekAgo);
  document.getElementById('endDate').value = formatDateForInput(today);

  // Login handler - PERBAIKAN: Include level akses
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    document.getElementById('loginMessage').innerText = 'Memeriksa...';
    
    try {
      const res = await fetch(SCRIPT_URL, { 
        method: 'POST', 
        body: JSON.stringify({ action: 'login', username, password }) 
      });
      const data = await res.json();
      
      if (data && data.success) {
        kasirInfo = data;
        console.log('Login Success - User Info:', kasirInfo); // Debug
        document.getElementById('namaToko').innerText = kasirInfo.namaToko || 'Aplikasi Kasir';
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('kasirPage').classList.add('active');
        
        // PERBAIKAN: Tampilkan tab berdasarkan level akses
        showTabsBasedOnLevel();
        
        await loadMenu();
        document.getElementById('loginMessage').innerText = '';
      } else {
        document.getElementById('loginMessage').innerText = 'Login gagal';
      }
    } catch(err) {
      document.getElementById('loginMessage').innerText = 'Gagal terhubung ke server';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    kasirInfo = {}; 
    transaksi = []; 
    menuData = [];
    filteredMenu = [];
    currentPage = 1;
    menuManagementData = [];
    editingMenuId = null;
    userManagementData = [];
    tokoManagementData = [];
    editingUserId = null;
    editingTokoId = null;
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('loginPage').classList.add('active');
  });

  // Menu search handlers
  document.getElementById('menuSearch').addEventListener('input', (e) => {
    const q = e.target.value || '';
    filterMenuByText(q);
  });

  document.getElementById('clearSearch').addEventListener('click', () => {
    document.getElementById('menuSearch').value = '';
    filterMenuByText('');
    document.getElementById('menuSearch').focus();
  });

  // Pagination handlers
  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredMenu.length / ITEMS_PER_PAGE);
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  });

  // Cash input handler
  document.getElementById('cashInput').addEventListener('input', function(e) {
    let digits = (e.target.value + '').replace(/[^\d]/g, '');
    if (digits === '') {
      e.target.value = '0';
      document.getElementById('uangKembali').textContent = '0';
      return;
    }
    e.target.value = formatRupiah(digits);
    hitungKembali();
  });

  document.getElementById('cashInput').addEventListener('focus', function(e) {
    e.target.select();
  });

  // Transaksi selesai handler
  document.getElementById('btnSelesai').addEventListener('click', selesaikanTransaksi);

  // Menu management handlers
  document.getElementById('btnSimpanMenu').addEventListener('click', saveMenu);
  document.getElementById('btnBatalEdit').addEventListener('click', cancelEdit);

  // User management handlers
  document.getElementById('btnSimpanUser').addEventListener('click', saveUser);
  document.getElementById('btnBatalEditUser').addEventListener('click', cancelEditUser);
  document.getElementById('btnSimpanToko').addEventListener('click', saveToko);
  document.getElementById('btnBatalEditToko').addEventListener('click', cancelEditToko);

  // PERBAIKAN: Auto-generate ID toko saat form dibuka
  document.getElementById('inputNamaToko').addEventListener('focus', function() {
    const idTokoInput = document.getElementById('inputIdToko');
    if (!idTokoInput.value || idTokoInput.value === '') {
      // Generate temporary ID - akan diganti oleh backend saat simpan
      idTokoInput.value = 'TEMP-' + Date.now();
    }
  });

  // PERBAIKAN: Validasi duplikat nama menu saat input
  document.getElementById('inputNamaMenu').addEventListener('input', function(e) {
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

  // Laporan handlers
  document.getElementById('btnLoadLaporan').addEventListener('click', loadLaporan);
  document.getElementById('btnResetFilter').addEventListener('click', resetFilterLaporan);
  document.getElementById('btnExportLaporan').addEventListener('click', exportLaporanPDF);

  // Setting handlers - PERBAIKAN: Hanya untuk Owner
  document.getElementById('btnSaveSetting').addEventListener('click', saveSetting);
  document.getElementById('btnResetSetting').addEventListener('click', resetSetting);

  // Color preview handlers
  document.getElementById('settingAccentColor').addEventListener('input', function(e) {
    document.getElementById('accentPreview').style.backgroundColor = e.target.value;
  });
  
  document.getElementById('settingAccentDark').addEventListener('input', function(e) {
    document.getElementById('accentDarkPreview').style.backgroundColor = e.target.value;
  });

  // Enter key for login
  document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('loginBtn').click();
    }
  });

  // Enter key untuk cash input
  document.getElementById('cashInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btnSelesai').click();
    }
  });

  // Auto load setting on page load
  loadSetting();
});
