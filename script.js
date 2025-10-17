// ========== STATE ==========
let kasir = null;
let menuData = [];
let cart = [];

// ========== DOM READY ==========
document.addEventListener("DOMContentLoaded", () => {
  const loginPage = document.getElementById("loginPage");
  const kasirPage = document.getElementById("kasirPage");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const btnSelesai = document.getElementById("btnSelesai");
  const menuList = document.getElementById("menuList");
  const tblBody = document.querySelector("#tblCart tbody");
  const totalBayar = document.getElementById("totalBayar");
  const cash = document.getElementById("cash");
  const change = document.getElementById("change");

  btnLogin.addEventListener("click", async () => {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const msg = document.getElementById("loginMsg");
    msg.textContent = "Memeriksa...";
    const res = await fetch(`${SHEET_API_URL}?q=users`);
    const users = await res.json();
    const found = users.find(u => u.username === username && u.password === password && u.status === "Aktif");
    if (!found) {
      msg.textContent = "Username / password salah.";
      return;
    }
    kasir = found;
    msg.textContent = "";
    loginPage.classList.remove("active");
    kasirPage.classList.remove("hidden");
    kasirPage.classList.add("active");
    document.getElementById("tokoNama").textContent = found.namatoko;
    document.getElementById("kasirNama").textContent = found.namakasir;
    loadMenu(found.id_toko);
  });

  btnLogout.addEventListener("click", () => {
    location.reload();
  });

  async function loadMenu(id_toko) {
    const res = await fetch(`${SHEET_API_URL}?q=menu&id_toko=${id_toko}`);
    menuData = await res.json();
    menuList.innerHTML = "";
    menuData.forEach(m => {
      const li = document.createElement("li");
      li.textContent = `${m.NamaItem} - Rp ${m.Harga}`;
      li.addEventListener("click", () => addToCart(m));
      menuList.appendChild(li);
    });
  }

  function addToCart(item) {
    const exist = cart.find(x => x.id === item.id);
    if (exist) exist.qty++;
    else cart.push({ id: item.id, nama: item.NamaItem, harga: item.Harga, qty: 1 });
    renderCart();
    // fokus ke qty input terakhir
    const lastQty = tblBody.querySelector("tr:last-child input.qty");
    if (lastQty) lastQty.focus();
  }

  function renderCart() {
    tblBody.innerHTML = "";
    let total = 0;
    cart.forEach((it, i) => {
      const sub = it.qty * it.harga;
      total += sub;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${it.nama}</td>
        <td><input type="number" class="qty" value="${it.qty}" data-i="${i}" /></td>
        <td>${it.harga}</td>
        <td>${sub}</td>
        <td><button data-del="${i}">❌</button></td>`;
      tblBody.appendChild(tr);
    });
    totalBayar.value = total;
    change.value = "";
  }

  tblBody.addEventListener("input", e => {
    if (e.target.classList.contains("qty")) {
      const i = e.target.dataset.i;
      cart[i].qty = parseInt(e.target.value) || 0;
      renderCart();
      e.target.focus();
    }
  });

  tblBody.addEventListener("click", e => {
    if (e.target.dataset.del) {
      cart.splice(e.target.dataset.del, 1);
      renderCart();
    }
  });

  // Enter di qty -> fokus cash
  tblBody.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.classList.contains("qty")) {
      cash.focus();
    }
  });

  cash.addEventListener("input", () => {
    const kemb = (parseInt(cash.value) || 0) - (parseInt(totalBayar.value) || 0);
    change.value = kemb;
  });

  cash.addEventListener("keydown", e => {
    if (e.key === "Enter") btnSelesai.click();
  });

  btnSelesai.addEventListener("click", async () => {
    if (cart.length === 0) return alert("Keranjang kosong!");
    const payload = {
      items: cart.map(it => ({
        nama: it.nama,
        qty: it.qty,
        harga: it.harga,
        subtotal: it.qty * it.harga
      })),
      total_bayar: parseInt(totalBayar.value) || 0,
      cash: parseInt(cash.value) || 0,
      change: parseInt(change.value) || 0,
      id_toko: kasir.id_toko,
      nama_toko: kasir.namatoko,
      kasir_nama: kasir.namakasir,
      kasir_username: kasir.username
    };
    const res = await fetch(SHEET_API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const j = await res.json();
    if (j.success) {
      alert("Transaksi selesai & dikirim.");
      window.print(); // cetak otomatis
      cart = [];
      renderCart();
      cash.value = change.value = "";
    } else {
      alert("Gagal: " + j.message);
    }
  });
});
