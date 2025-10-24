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
      } else if (targetTab === 'setting') {
        loadSetting();
      }
    });
  });
}

// ==================== MENU MANAGEMENT FUNCTIONS ====================

// Load data untuk management menu
async function loadMenuManagement() {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'getMenuManagement',
        idToko: kasirInfo.idToko 
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      menuManagementData = data.data || [];
      renderMenuManagementList();
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
        <button class="btn-edit" data-id="${menu.id_menu}">✏️ Edit</button>
        <button class="btn-delete" data-id="${menu.id_menu}">🗑️ Hapus</button>
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

// Batal edit
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
        idToko: kasirInfo.idToko
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      alert('Menu berhasil dihapus');
      loadMenuManagement(); // Reload data
      loadMenu(); // Reload menu untuk transaksi
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
  const idToko = toko === 'current' ? kasirInfo.idToko : 'ALL';
  
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
    // Tampilkan pesan error
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
      targetToko: idToko
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
      loadMenuManagement(); // Reload data
      loadMenu(); // Reload menu untuk transaksi
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

// ==================== TRANSAKSI FUNCTIONS (DIPERBAIKI) ====================

// PERBAIKAN: Load menu dengan data stok untuk transaksi
async function loadMenu(){
  const spinner = document.getElementById('menuLoading');
  if (spinner) spinner.style.display = 'flex';
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'getMenuManagement', idToko: kasirInfo.idToko })
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
        idToko: kasirInfo.idToko
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

// ==================== SETTING FUNCTIONS ====================

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

async function saveSetting() {
  try {
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
        settings: settings
      })
    });
    
    const data = await res.json();
    if (data && data.success) {
      alert('Setting berhasil disimpan!');
      applyThemeSettings(settings);
    } else {
      alert('Gagal menyimpan setting');
    }
  } catch (err) {
    alert('Gagal menyimpan setting');
  }
}

function applyThemeSettings(settings) {
  document.documentElement.style.setProperty('--accent', settings.Warna_Aksen || '#14ffec');
  document.documentElement.style.setProperty('--accent-dark', settings.Warna_Aksen_Dark || '#0d7377');
  document.title = settings.Nama_Aplikasi || 'KASIR WEB';
}

function resetSetting() {
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
  
  // Set default dates for laporan
  const today = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(today.getDate() - 7);
  
  document.getElementById('startDate').value = formatDateForInput(oneWeekAgo);
  document.getElementById('endDate').value = formatDateForInput(today);

  // Login handler
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
        document.getElementById('namaToko').innerText = kasirInfo.namaToko || 'Aplikasi Kasir';
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('kasirPage').classList.add('active');
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

  // Setting handlers
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
