const APP_CONFIG = window.APP_CONFIG || {};

const requiredConfigMissing =
  !APP_CONFIG.SUPABASE_URL ||
  !APP_CONFIG.SUPABASE_ANON_KEY ||
  APP_CONFIG.SUPABASE_URL.includes("YOUR_") ||
  APP_CONFIG.SUPABASE_ANON_KEY.includes("YOUR_");

if (!window.supabase || requiredConfigMissing) {
  document.body.innerHTML = `
    <main style="max-width:820px;margin:40px auto;padding:20px;font-family:Manrope,sans-serif;line-height:1.6;">
      <h1>Konfigürasyon eksik</h1>
      <p><code>static/config.js</code> dosyasını Supabase bilgileri ile doldurun.</p>
      <pre style="background:#0f172a;color:#fff;padding:14px;border-radius:10px;overflow:auto;">window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY"
};</pre>
      <p>Ardından sayfayı yenileyin.</p>
    </main>
  `;
  throw new Error("Missing Supabase config");
}

const { createClient } = window.supabase;
const db = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);

const SESSION_KEY = "hotel_pos_session_v1";
const ROLE_TAB_ACCESS = {
  resepsiyon: ["checkin", "checkout", "reports"],
  servis: ["pos", "reports"],
  admin: ["checkin", "pos", "checkout", "menu", "reports"],
};

const state = {
  currentUser: null,
  outlets: [],
  menuItems: [],
  activeStays: [],
  cart: [],
  recentOrders: [],
  checkout: {
    stayId: null,
    orders: [],
    payments: [],
    totals: { charges: 0, payments: 0, balance: 0 },
  },
  report: {
    date: new Date().toISOString().slice(0, 10),
    summary: {
      orderCount: 0,
      roomOrderCount: 0,
      walkinOrderCount: 0,
      grossSales: 0,
      paymentTotal: 0,
      net: 0,
    },
    byOutlet: [],
    byPayment: [],
    byRoom: [],
    openBalances: [],
  },
};

const ui = {
  tabs: document.getElementById("tabs"),
  tabButtons: Array.from(document.querySelectorAll(".tab")),
  panels: {
    checkin: document.getElementById("panel-checkin"),
    pos: document.getElementById("panel-pos"),
    checkout: document.getElementById("panel-checkout"),
    menu: document.getElementById("panel-menu"),
    reports: document.getElementById("panel-reports"),
  },

  authOverlay: document.getElementById("authOverlay"),
  loginForm: document.getElementById("loginForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPin: document.getElementById("loginPin"),
  currentUserBadge: document.getElementById("currentUserBadge"),
  logoutBtn: document.getElementById("logoutBtn"),

  checkinForm: document.getElementById("checkinForm"),
  activeStaysTable: document.getElementById("activeStaysTable"),

  outletSelect: document.getElementById("outletSelect"),
  staySelect: document.getElementById("staySelect"),
  menuGrid: document.getElementById("menuGrid"),
  cartList: document.getElementById("cartList"),
  cartTotal: document.getElementById("cartTotal"),
  saveOrderBtn: document.getElementById("saveOrderBtn"),
  clearCartBtn: document.getElementById("clearCartBtn"),
  orderNote: document.getElementById("orderNote"),
  recentOrdersTable: document.getElementById("recentOrdersTable"),

  checkoutStaySelect: document.getElementById("checkoutStaySelect"),
  refreshCheckoutBtn: document.getElementById("refreshCheckoutBtn"),
  folioOrders: document.getElementById("folioOrders"),
  paymentForm: document.getElementById("paymentForm"),
  paymentsList: document.getElementById("paymentsList"),
  totalCharges: document.getElementById("totalCharges"),
  totalPayments: document.getElementById("totalPayments"),
  remainingBalance: document.getElementById("remainingBalance"),
  closeStayBtn: document.getElementById("closeStayBtn"),

  menuForm: document.getElementById("menuForm"),
  menuOutlet: document.getElementById("menuOutlet"),
  menuCategory: document.getElementById("menuCategory"),
  menuImageUrl: document.getElementById("menuImageUrl"),
  menuList: document.getElementById("menuList"),

  reportDate: document.getElementById("reportDate"),
  refreshReportBtn: document.getElementById("refreshReportBtn"),
  printReportBtn: document.getElementById("printReportBtn"),
  reportSummaryCards: document.getElementById("reportSummaryCards"),
  reportOutletList: document.getElementById("reportOutletList"),
  reportPaymentList: document.getElementById("reportPaymentList"),
  reportRoomList: document.getElementById("reportRoomList"),
  reportOpenBalances: document.getElementById("reportOpenBalances"),

  toast: document.getElementById("toast"),
  printArea: document.getElementById("printArea"),
};

function money(v) {
  return `${Number(v || 0).toFixed(2)} TL`;
}

function datetime(v) {
  if (!v) return "-";
  return new Date(v).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function dateOnly(v) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("tr-TR");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, isError = false) {
  ui.toast.textContent = message;
  ui.toast.style.background = isError ? "#b91c1c" : "#0f172a";
  ui.toast.classList.add("show");
  setTimeout(() => ui.toast.classList.remove("show"), 2400);
}

function must(data, error, fallbackMessage) {
  if (error) throw new Error(error.message || fallbackMessage);
  return data;
}

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function loadSavedSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function allowedTabs() {
  const role = state.currentUser?.role;
  return ROLE_TAB_ACCESS[role] || [];
}

function hasAccess(tabKey) {
  return allowedTabs().includes(tabKey);
}

function requireAccess(tabKey) {
  if (!hasAccess(tabKey)) {
    showToast("Bu işlem için yetkiniz yok.", true);
    return false;
  }
  return true;
}

function setActiveTab(tabKey) {
  ui.tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabKey);
  });

  Object.entries(ui.panels).forEach(([key, panel]) => {
    panel.classList.toggle("active", key === tabKey);
  });
}

function applyRoleUi() {
  const role = state.currentUser?.role;
  const roleTabs = allowedTabs();

  ui.tabButtons.forEach((btn) => {
    const roles = (btn.dataset.role || "").split(",").map((r) => r.trim());
    btn.classList.toggle("hidden", !roles.includes(role));
  });

  const activeBtn = ui.tabButtons.find((btn) => btn.classList.contains("active") && !btn.classList.contains("hidden"));
  if (!activeBtn) {
    if (!roleTabs.length) return;
    setActiveTab(roleTabs[0]);
  }

  const display = state.currentUser?.display_name || state.currentUser?.username || "-";
  ui.currentUserBadge.textContent = `${display} (${role})`;
  ui.currentUserBadge.classList.remove("hidden");
  ui.logoutBtn.classList.remove("hidden");
}

function renderLoggedOut() {
  state.currentUser = null;
  clearSession();
  ui.currentUserBadge.classList.add("hidden");
  ui.logoutBtn.classList.add("hidden");
  ui.authOverlay.classList.remove("hidden");
}

async function login(username, pin) {
  const res = await db
    .from("staff_users")
    .select("id,username,display_name,role,is_active")
    .eq("username", username)
    .eq("pin_code", pin)
    .eq("is_active", true)
    .maybeSingle();

  if (res.error) throw new Error(res.error.message);
  if (!res.data) throw new Error("Kullanıcı adı veya PIN hatalı.");

  state.currentUser = res.data;
  saveSession(res.data);
  ui.authOverlay.classList.add("hidden");
  applyRoleUi();

  await refreshAllData();
  await loadCheckoutForStay(state.checkout.stayId);
  await loadDailyReport(ui.reportDate.value || state.report.date);
}

async function tryRestoreSession() {
  const saved = loadSavedSession();
  if (!saved?.id) return false;

  const res = await db
    .from("staff_users")
    .select("id,username,display_name,role,is_active")
    .eq("id", saved.id)
    .eq("is_active", true)
    .maybeSingle();

  if (res.error || !res.data) {
    renderLoggedOut();
    return false;
  }

  state.currentUser = res.data;
  saveSession(res.data);
  ui.authOverlay.classList.add("hidden");
  applyRoleUi();
  return true;
}

function setupTabs() {
  ui.tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn || btn.classList.contains("hidden")) return;
    setActiveTab(btn.dataset.tab);
  });
}

async function ensureRoom(roomNumber) {
  const normalized = String(roomNumber || "").trim();
  if (!normalized) throw new Error("Oda numarası zorunlu.");

  const existing = await db
    .from("rooms")
    .select("id")
    .eq("room_number", normalized)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data.id;

  const inserted = await db
    .from("rooms")
    .insert({ room_number: normalized })
    .select("id")
    .single();

  return must(inserted.data, inserted.error, "Oda oluşturulamadı").id;
}

async function loadOutlets() {
  const res = await db.from("outlets").select("id,name").order("name", { ascending: true });
  state.outlets = must(res.data, res.error, "Outlet listesi alınamadı");
}

async function loadMenuItems() {
  const res = await db
    .from("menu_items")
    .select("id,name,price,is_active,outlet_id,category,image_url")
    .eq("is_active", true)
    .order("name", { ascending: true });

  state.menuItems = must(res.data, res.error, "Menü alınamadı");
}

async function loadActiveStays() {
  const staysRes = await db
    .from("stays")
    .select(`
      id,
      check_in,
      check_out_plan,
      note,
      room:rooms!stays_room_id_fkey(id,room_number),
      guest:guests!stays_guest_id_fkey(id,full_name,phone)
    `)
    .eq("status", "open")
    .order("check_in", { ascending: false });

  const stays = must(staysRes.data, staysRes.error, "Aktif konaklamalar alınamadı");
  const ids = stays.map((s) => s.id);
  let balanceMap = new Map();

  if (ids.length > 0) {
    const balRes = await db.from("v_stay_balance").select("stay_id,balance").in("stay_id", ids);
    const balRows = must(balRes.data, balRes.error, "Bakiye alınamadı");
    balanceMap = new Map(balRows.map((b) => [b.stay_id, Number(b.balance || 0)]));
  }

  state.activeStays = stays.map((s) => ({ ...s, balance: balanceMap.get(s.id) || 0 }));
}

async function loadRecentOrders() {
  const ordersRes = await db
    .from("orders")
    .select("id,created_at,stay_id,outlet_id")
    .order("created_at", { ascending: false })
    .limit(30);

  const orders = must(ordersRes.data, ordersRes.error, "Siparişler alınamadı");
  const orderIds = orders.map((o) => o.id);
  const stayIds = [...new Set(orders.map((o) => o.stay_id).filter(Boolean))];

  const [totalsRes, outletsRes, staysRes] = await Promise.all([
    orderIds.length
      ? db.from("v_order_totals").select("order_id,total").in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    db.from("outlets").select("id,name"),
    stayIds.length
      ? db
          .from("stays")
          .select("id,room:rooms!stays_room_id_fkey(room_number)")
          .in("id", stayIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const totals = must(totalsRes.data, totalsRes.error, "Sipariş tutarı alınamadı");
  const outlets = must(outletsRes.data, outletsRes.error, "Outlet alınamadı");
  const stays = must(staysRes.data, staysRes.error, "Oda bilgisi alınamadı");

  const totalMap = new Map(totals.map((t) => [t.order_id, Number(t.total || 0)]));
  const outletMap = new Map(outlets.map((o) => [o.id, o.name]));
  const roomMap = new Map(stays.map((s) => [s.id, s.room?.room_number || "-"]));

  state.recentOrders = orders.map((o) => ({
    ...o,
    total: totalMap.get(o.id) || 0,
    outlet_name: outletMap.get(o.outlet_id) || "-",
    room_number: o.stay_id ? roomMap.get(o.stay_id) || "-" : "Yürüyen",
  }));
}

function renderOutletSelects() {
  const options = state.outlets
    .map((o) => `<option value="${o.id}">${escapeHtml(o.name)}</option>`)
    .join("");

  ui.outletSelect.innerHTML = options;
  ui.menuOutlet.innerHTML = options;
}

function renderStaySelects() {
  const stayOptions = state.activeStays
    .map(
      (s) =>
        `<option value="${s.id}">Oda ${escapeHtml(s.room?.room_number)} - ${escapeHtml(
          s.guest?.full_name
        )} (${money(s.balance)})</option>`
    )
    .join("");

  ui.staySelect.innerHTML = `<option value="">Yürüyen Müşteri</option>${stayOptions}`;
  ui.checkoutStaySelect.innerHTML = `<option value="">Seçiniz</option>${stayOptions}`;

  if (state.checkout.stayId) {
    const exists = state.activeStays.some((s) => String(s.id) === String(state.checkout.stayId));
    ui.checkoutStaySelect.value = exists ? String(state.checkout.stayId) : "";
    if (!exists) state.checkout.stayId = null;
  }
}

function renderActiveStaysTable() {
  if (!state.activeStays.length) {
    ui.activeStaysTable.innerHTML = `<tr><td colspan="5">Aktif konaklama yok.</td></tr>`;
    return;
  }

  ui.activeStaysTable.innerHTML = state.activeStays
    .map(
      (s) => `
      <tr>
        <td><strong>${escapeHtml(s.room?.room_number)}</strong></td>
        <td>
          ${escapeHtml(s.guest?.full_name)}
          <div class="small">${escapeHtml(s.guest?.phone || "-")}</div>
        </td>
        <td>${datetime(s.check_in)}</td>
        <td>${dateOnly(s.check_out_plan)}</td>
        <td>Açık (${money(s.balance)})</td>
      </tr>
    `
    )
    .join("");
}

function renderMenuGrid() {
  const selectedOutletId = Number(ui.outletSelect.value || 0);
  const visibleItems = state.menuItems.filter((m) => m.outlet_id === selectedOutletId);

  if (!visibleItems.length) {
    ui.menuGrid.innerHTML = `<p>Bu outlet için aktif ürün yok.</p>`;
    return;
  }

  ui.menuGrid.innerHTML = visibleItems
    .map(
      (m) => `
      <article class="menu-item" data-id="${m.id}">
        <div class="menu-item-image" style="background-image:url('${escapeHtml(
          m.image_url || `https://www.themealdb.com/images/media/meals/1548772327.jpg`
        )}')"></div>
        <div class="menu-item-category">${escapeHtml(m.category || "Genel")}</div>
        <strong>${escapeHtml(m.name)}</strong>
        <span>${money(m.price)}</span>
        <div class="row">
          <input type="number" min="1" value="1" data-role="qty">
          <button class="btn ghost" data-role="add" type="button">Ekle</button>
        </div>
      </article>
    `
    )
    .join("");
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function renderCart() {
  if (!state.cart.length) {
    ui.cartList.innerHTML = `<p>Henüz ürün eklenmedi.</p>`;
    ui.cartTotal.textContent = `Toplam: ${money(0)}`;
    return;
  }

  ui.cartList.innerHTML = state.cart
    .map(
      (item) => `
      <div class="cart-item">
        <div><strong>${escapeHtml(item.name)}</strong></div>
        <div>${item.qty} x ${money(item.price)} = <strong>${money(item.qty * item.price)}</strong></div>
        <div class="actions">
          <button class="btn ghost" data-cart-action="minus" data-id="${item.id}" type="button">-1</button>
          <button class="btn ghost" data-cart-action="plus" data-id="${item.id}" type="button">+1</button>
          <button class="btn warn" data-cart-action="remove" data-id="${item.id}" type="button">Sil</button>
        </div>
      </div>
    `
    )
    .join("");

  ui.cartTotal.textContent = `Toplam: ${money(cartTotal())}`;
}

function renderRecentOrders() {
  if (!state.recentOrders.length) {
    ui.recentOrdersTable.innerHTML = `<tr><td colspan="6">Sipariş yok.</td></tr>`;
    return;
  }

  ui.recentOrdersTable.innerHTML = state.recentOrders
    .map(
      (o) => `
      <tr>
        <td>#${o.id}</td>
        <td>${datetime(o.created_at)}</td>
        <td>${escapeHtml(o.outlet_name)}</td>
        <td>${escapeHtml(o.room_number)}</td>
        <td>${money(o.total)}</td>
        <td><button class="btn ghost" data-print-order="${o.id}" type="button">Yazdır</button></td>
      </tr>
    `
    )
    .join("");
}

function renderMenuList() {
  if (!state.menuItems.length) {
    ui.menuList.innerHTML = `<p>Menü boş.</p>`;
    return;
  }

  const outletMap = new Map(state.outlets.map((o) => [o.id, o.name]));
  ui.menuList.innerHTML = state.menuItems
    .map(
      (m) => `
      <div class="ledger-item">
        <div class="menu-row">
          <div class="menu-row-image" style="background-image:url('${escapeHtml(
            m.image_url || `https://www.themealdb.com/images/media/meals/1548772327.jpg`
          )}')"></div>
          <div>
            <strong>${escapeHtml(m.name)}</strong>
            <div>${escapeHtml(m.category || "Genel")}</div>
            <div>${escapeHtml(outletMap.get(m.outlet_id) || "-")} | ${money(m.price)}</div>
          </div>
        </div>
      </div>
    `
    )
    .join("");
}

function renderCheckoutView() {
  const orders = state.checkout.orders;
  const payments = state.checkout.payments;

  if (!orders.length) {
    ui.folioOrders.innerHTML = `<p>Bu konaklama için adisyon yok.</p>`;
  } else {
    ui.folioOrders.innerHTML = orders
      .map((o) => {
        const itemsHtml = o.items
          .map(
            (it) =>
              `<div>${escapeHtml(it.item_name)} (${it.quantity} x ${money(it.unit_price)})</div>`
          )
          .join("");

        return `
          <div class="ledger-item">
            <strong>#${o.id} - ${escapeHtml(o.outlet_name)}</strong>
            <div class="small">${datetime(o.created_at)}</div>
            <div>${itemsHtml}</div>
            <div><strong>${money(o.total)}</strong></div>
          </div>
        `;
      })
      .join("");
  }

  if (!payments.length) {
    ui.paymentsList.innerHTML = `<p>Henüz ödeme girilmedi.</p>`;
  } else {
    ui.paymentsList.innerHTML = payments
      .map(
        (p) => `
        <div class="ledger-item">
          <strong>${money(p.amount)}</strong>
          <div>${escapeHtml(p.method)} | ${datetime(p.created_at)}</div>
          <div class="small">${escapeHtml(p.note || "-")}</div>
        </div>
      `
      )
      .join("");
  }

  ui.totalCharges.textContent = money(state.checkout.totals.charges);
  ui.totalPayments.textContent = money(state.checkout.totals.payments);
  ui.remainingBalance.textContent = money(state.checkout.totals.balance);
  ui.remainingBalance.style.color = state.checkout.totals.balance > 0 ? "#b91c1c" : "#166534";
}

function renderReport() {
  const s = state.report.summary;
  ui.reportSummaryCards.innerHTML = `
    <article class="report-card"><div class="label">Toplam Satış</div><div class="value">${money(s.grossSales)}</div></article>
    <article class="report-card"><div class="label">Adisyon Sayısı</div><div class="value">${s.orderCount}</div></article>
    <article class="report-card"><div class="label">Toplam Tahsilat</div><div class="value">${money(s.paymentTotal)}</div></article>
    <article class="report-card"><div class="label">Günlük Net</div><div class="value">${money(s.net)}</div></article>
  `;

  if (!state.report.byOutlet.length) {
    ui.reportOutletList.innerHTML = `<p>Kayıt yok.</p>`;
  } else {
    ui.reportOutletList.innerHTML = state.report.byOutlet
      .map(
        (x) => `
        <div class="ledger-item">
          <strong>${escapeHtml(x.name)}</strong>
          <div>${x.orderCount} adisyon</div>
          <div><strong>${money(x.total)}</strong></div>
        </div>
      `
      )
      .join("");
  }

  if (!state.report.byPayment.length) {
    ui.reportPaymentList.innerHTML = `<p>Kayıt yok.</p>`;
  } else {
    ui.reportPaymentList.innerHTML = state.report.byPayment
      .map(
        (x) => `
        <div class="ledger-item">
          <strong>${escapeHtml(x.method)}</strong>
          <div>${x.count} işlem</div>
          <div><strong>${money(x.total)}</strong></div>
        </div>
      `
      )
      .join("");
  }

  if (!state.report.byRoom.length) {
    ui.reportRoomList.innerHTML = `<p>Kayıt yok.</p>`;
  } else {
    ui.reportRoomList.innerHTML = state.report.byRoom
      .map(
        (x) => `
        <div class="ledger-item">
          <strong>Oda ${escapeHtml(x.roomNumber)}</strong>
          <div>${escapeHtml(x.guestName || "-")}</div>
          <div><strong>${money(x.total)}</strong></div>
        </div>
      `
      )
      .join("");
  }

  if (!state.report.openBalances.length) {
    ui.reportOpenBalances.innerHTML = `<p>Açık alacak yok.</p>`;
  } else {
    ui.reportOpenBalances.innerHTML = state.report.openBalances
      .map(
        (x) => `
        <div class="ledger-item">
          <strong>Oda ${escapeHtml(x.roomNumber)}</strong>
          <div>${escapeHtml(x.guestName || "-")}</div>
          <div><strong>${money(x.balance)}</strong></div>
        </div>
      `
      )
      .join("");
  }
}

async function loadCheckoutForStay(stayId) {
  if (!stayId) {
    state.checkout.orders = [];
    state.checkout.payments = [];
    state.checkout.totals = { charges: 0, payments: 0, balance: 0 };
    renderCheckoutView();
    return;
  }

  const ordersRes = await db
    .from("orders")
    .select("id,created_at,outlet_id")
    .eq("stay_id", stayId)
    .order("created_at", { ascending: false });

  const orders = must(ordersRes.data, ordersRes.error, "Folio siparişleri alınamadı");
  const orderIds = orders.map((o) => o.id);

  const [itemsRes, outletsRes, paymentsRes] = await Promise.all([
    orderIds.length
      ? db
          .from("order_items")
          .select("order_id,item_name,quantity,unit_price")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    db.from("outlets").select("id,name"),
    db
      .from("payments")
      .select("id,method,amount,note,created_at")
      .eq("stay_id", stayId)
      .order("created_at", { ascending: false }),
  ]);

  const items = must(itemsRes.data, itemsRes.error, "Sipariş kalemleri alınamadı");
  const outlets = must(outletsRes.data, outletsRes.error, "Outletler alınamadı");
  const payments = must(paymentsRes.data, paymentsRes.error, "Ödemeler alınamadı");

  const outletMap = new Map(outlets.map((o) => [o.id, o.name]));
  const itemsByOrder = new Map();
  items.forEach((i) => {
    if (!itemsByOrder.has(i.order_id)) itemsByOrder.set(i.order_id, []);
    itemsByOrder.get(i.order_id).push(i);
  });

  const preparedOrders = orders.map((o) => {
    const orderItems = itemsByOrder.get(o.id) || [];
    const total = orderItems.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0);
    return {
      ...o,
      outlet_name: outletMap.get(o.outlet_id) || "-",
      items: orderItems,
      total,
    };
  });

  const chargeTotal = preparedOrders.reduce((sum, o) => sum + o.total, 0);
  const paymentTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  state.checkout.orders = preparedOrders;
  state.checkout.payments = payments;
  state.checkout.totals = {
    charges: chargeTotal,
    payments: paymentTotal,
    balance: chargeTotal - paymentTotal,
  };

  renderCheckoutView();
}

function dateRangeIso(dateStr) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  return [start.toISOString(), end.toISOString()];
}

async function loadDailyReport(dateStr) {
  if (!dateStr) return;

  const [startIso, endIso] = dateRangeIso(dateStr);
  state.report.date = dateStr;

  const ordersRes = await db
    .from("orders")
    .select("id,created_at,stay_id,outlet_id,status")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  const paymentsRes = await db
    .from("payments")
    .select("method,amount")
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  const outletsRes = await db.from("outlets").select("id,name");

  const orders = must(ordersRes.data, ordersRes.error, "Rapor siparişleri alınamadı");
  const payments = must(paymentsRes.data, paymentsRes.error, "Rapor ödemeleri alınamadı");
  const outlets = must(outletsRes.data, outletsRes.error, "Outletler alınamadı");

  const orderIds = orders.map((o) => o.id);
  const stayIds = [...new Set(orders.map((o) => o.stay_id).filter(Boolean))];

  const [itemsRes, staysRes, openBalancesRes] = await Promise.all([
    orderIds.length
      ? db
          .from("order_items")
          .select("order_id,quantity,unit_price")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    stayIds.length
      ? db
          .from("stays")
          .select(`
            id,
            room:rooms!stays_room_id_fkey(room_number),
            guest:guests!stays_guest_id_fkey(full_name)
          `)
          .in("id", stayIds)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("v_stay_balance")
      .select("stay_id,balance,status")
      .eq("status", "open")
      .gt("balance", 0),
  ]);

  const items = must(itemsRes.data, itemsRes.error, "Rapor kalemleri alınamadı");
  const stays = must(staysRes.data, staysRes.error, "Rapor oda bilgisi alınamadı");
  const openBalances = must(openBalancesRes.data, openBalancesRes.error, "Açık bakiyeler alınamadı");

  const orderTotalMap = new Map();
  items.forEach((i) => {
    const current = orderTotalMap.get(i.order_id) || 0;
    orderTotalMap.set(i.order_id, current + Number(i.quantity) * Number(i.unit_price));
  });

  const outletMap = new Map(outlets.map((o) => [o.id, o.name]));
  const stayMap = new Map(
    stays.map((s) => [
      s.id,
      {
        roomNumber: s.room?.room_number || "-",
        guestName: s.guest?.full_name || "-",
      },
    ])
  );

  const byOutletMap = new Map();
  const byRoomMap = new Map();

  let grossSales = 0;
  let roomOrderCount = 0;
  let walkinOrderCount = 0;

  orders.forEach((o) => {
    const total = orderTotalMap.get(o.id) || 0;
    grossSales += total;

    const outletName = outletMap.get(o.outlet_id) || "-";
    const existingOutlet = byOutletMap.get(outletName) || { name: outletName, orderCount: 0, total: 0 };
    existingOutlet.orderCount += 1;
    existingOutlet.total += total;
    byOutletMap.set(outletName, existingOutlet);

    if (o.stay_id) {
      roomOrderCount += 1;
      const stayInfo = stayMap.get(o.stay_id) || { roomNumber: "-", guestName: "-" };
      const key = String(o.stay_id);
      const existingRoom = byRoomMap.get(key) || {
        roomNumber: stayInfo.roomNumber,
        guestName: stayInfo.guestName,
        total: 0,
      };
      existingRoom.total += total;
      byRoomMap.set(key, existingRoom);
    } else {
      walkinOrderCount += 1;
    }
  });

  const byPaymentMap = new Map();
  let paymentTotal = 0;
  payments.forEach((p) => {
    const method = p.method || "diger";
    const current = byPaymentMap.get(method) || { method, count: 0, total: 0 };
    current.count += 1;
    current.total += Number(p.amount || 0);
    byPaymentMap.set(method, current);
    paymentTotal += Number(p.amount || 0);
  });

  const openStayIds = openBalances.map((b) => b.stay_id);
  let openStayInfoMap = new Map();
  if (openStayIds.length) {
    const openStaysRes = await db
      .from("stays")
      .select(`
        id,
        room:rooms!stays_room_id_fkey(room_number),
        guest:guests!stays_guest_id_fkey(full_name)
      `)
      .in("id", openStayIds);

    const openStays = must(openStaysRes.data, openStaysRes.error, "Açık oda bilgisi alınamadı");
    openStayInfoMap = new Map(
      openStays.map((s) => [s.id, { roomNumber: s.room?.room_number || "-", guestName: s.guest?.full_name || "-" }])
    );
  }

  state.report.summary = {
    orderCount: orders.length,
    roomOrderCount,
    walkinOrderCount,
    grossSales,
    paymentTotal,
    net: grossSales - paymentTotal,
  };

  state.report.byOutlet = [...byOutletMap.values()].sort((a, b) => b.total - a.total);
  state.report.byPayment = [...byPaymentMap.values()].sort((a, b) => b.total - a.total);
  state.report.byRoom = [...byRoomMap.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  state.report.openBalances = openBalances
    .map((x) => ({
      roomNumber: openStayInfoMap.get(x.stay_id)?.roomNumber || "-",
      guestName: openStayInfoMap.get(x.stay_id)?.guestName || "-",
      balance: Number(x.balance || 0),
    }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);

  renderReport();
}

async function refreshAllData() {
  await Promise.all([loadOutlets(), loadMenuItems(), loadActiveStays(), loadRecentOrders()]);
  renderOutletSelects();
  renderStaySelects();
  renderActiveStaysTable();
  renderMenuGrid();
  renderCart();
  renderRecentOrders();
  renderMenuList();
}

function addToCart(menuId, qty) {
  const item = state.menuItems.find((m) => m.id === menuId);
  if (!item) return;

  const safeQty = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1;
  const existing = state.cart.find((c) => c.id === item.id);
  if (existing) {
    existing.qty += safeQty;
  } else {
    state.cart.push({ id: item.id, name: item.name, price: Number(item.price), qty: safeQty });
  }
  renderCart();
}

function setupEvents() {
  ui.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      const username = ui.loginUsername.value.trim();
      const pin = ui.loginPin.value.trim();
      if (!username || !pin) throw new Error("Kullanıcı adı ve PIN zorunlu.");

      await login(username, pin);
      ui.loginForm.reset();
      showToast("Giriş başarılı.");
    } catch (error) {
      showToast(error.message || "Giriş başarısız", true);
    }
  });

  ui.logoutBtn.addEventListener("click", () => {
    renderLoggedOut();
    showToast("Çıkış yapıldı.");
  });

  ui.outletSelect.addEventListener("change", () => renderMenuGrid());

  ui.menuGrid.addEventListener("click", (e) => {
    if (!requireAccess("pos")) return;

    const addBtn = e.target.closest("button[data-role='add']");
    if (!addBtn) return;

    const card = addBtn.closest(".menu-item");
    if (!card) return;

    const id = Number(card.dataset.id);
    const qtyInput = card.querySelector("input[data-role='qty']");
    const qty = Number(qtyInput?.value || 1);
    addToCart(id, qty);
  });

  ui.cartList.addEventListener("click", (e) => {
    if (!requireAccess("pos")) return;

    const btn = e.target.closest("button[data-cart-action]");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    const item = state.cart.find((c) => c.id === id);
    if (!item) return;

    const action = btn.dataset.cartAction;
    if (action === "plus") item.qty += 1;
    if (action === "minus") item.qty -= 1;
    if (action === "remove" || item.qty <= 0) {
      state.cart = state.cart.filter((c) => c.id !== id);
    }

    renderCart();
  });

  ui.clearCartBtn.addEventListener("click", () => {
    if (!requireAccess("pos")) return;

    state.cart = [];
    ui.orderNote.value = "";
    renderCart();
  });

  ui.saveOrderBtn.addEventListener("click", async () => {
    if (!requireAccess("pos")) return;
    if (!state.cart.length) {
      showToast("Adisyona ürün ekleyin.", true);
      return;
    }

    try {
      const outletId = Number(ui.outletSelect.value || 0);
      if (!outletId) throw new Error("Outlet seçiniz.");

      const stayId = ui.staySelect.value ? Number(ui.staySelect.value) : null;
      const note = ui.orderNote.value.trim();

      const orderRes = await db
        .from("orders")
        .insert({
          outlet_id: outletId,
          stay_id: stayId,
          status: "closed",
          order_source: "pos",
          note: note || null,
        })
        .select("id")
        .single();

      const order = must(orderRes.data, orderRes.error, "Sipariş kaydedilemedi");

      const rows = state.cart.map((c) => ({
        order_id: order.id,
        menu_item_id: c.id,
        item_name: c.name,
        quantity: c.qty,
        unit_price: c.price,
      }));

      const itemsRes = await db.from("order_items").insert(rows);
      if (itemsRes.error) throw new Error(itemsRes.error.message);

      state.cart = [];
      ui.orderNote.value = "";
      renderCart();

      await printOrder(order.id);
      await refreshAllData();
      if (state.checkout.stayId && stayId === state.checkout.stayId) {
        await loadCheckoutForStay(state.checkout.stayId);
      }
      await loadDailyReport(ui.reportDate.value || state.report.date);

      showToast("Adisyon kaydedildi ve yazdırıldı.");
    } catch (error) {
      showToast(error.message || "Sipariş kaydedilemedi", true);
    }
  });

  ui.recentOrdersTable.addEventListener("click", async (e) => {
    if (!requireAccess("pos")) return;

    const btn = e.target.closest("button[data-print-order]");
    if (!btn) return;

    try {
      await printOrder(Number(btn.dataset.printOrder));
      showToast("Fiş yazdırma ekranı açıldı.");
    } catch (error) {
      showToast(error.message || "Yazdırılamadı", true);
    }
  });

  ui.checkinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireAccess("checkin")) return;

    try {
      const guestName = document.getElementById("guestName").value.trim();
      const guestPhone = document.getElementById("guestPhone").value.trim();
      const roomNumber = document.getElementById("roomNumber").value.trim();
      const plannedCheckout = document.getElementById("plannedCheckout").value;
      const note = document.getElementById("checkinNote").value.trim();

      if (!guestName || !roomNumber) throw new Error("Misafir adı ve oda no zorunlu.");

      const roomId = await ensureRoom(roomNumber);
      const openStay = await db
        .from("stays")
        .select("id")
        .eq("room_id", roomId)
        .eq("status", "open")
        .maybeSingle();

      if (openStay.error) throw new Error(openStay.error.message);
      if (openStay.data) throw new Error("Bu oda için açık konaklama zaten var.");

      const guestRes = await db
        .from("guests")
        .insert({ full_name: guestName, phone: guestPhone || null })
        .select("id")
        .single();
      const guest = must(guestRes.data, guestRes.error, "Misafir kaydı açılamadı");

      const stayRes = await db
        .from("stays")
        .insert({
          guest_id: guest.id,
          room_id: roomId,
          check_out_plan: plannedCheckout || null,
          note: note || null,
        })
        .select("id")
        .single();

      must(stayRes.data, stayRes.error, "Konaklama kaydı açılamadı");

      ui.checkinForm.reset();
      await refreshAllData();
      await loadDailyReport(ui.reportDate.value || state.report.date);
      showToast("Konaklama kaydı açıldı.");
    } catch (error) {
      showToast(error.message || "Check-in başarısız", true);
    }
  });

  ui.checkoutStaySelect.addEventListener("change", async () => {
    if (!requireAccess("checkout")) return;

    const value = ui.checkoutStaySelect.value;
    state.checkout.stayId = value ? Number(value) : null;
    await loadCheckoutForStay(state.checkout.stayId);
  });

  ui.refreshCheckoutBtn.addEventListener("click", async () => {
    if (!requireAccess("checkout")) return;

    try {
      await loadActiveStays();
      renderStaySelects();
      renderActiveStaysTable();
      await loadCheckoutForStay(state.checkout.stayId);
      showToast("Checkout verisi güncellendi.");
    } catch (error) {
      showToast(error.message || "Yenileme başarısız", true);
    }
  });

  ui.paymentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireAccess("checkout")) return;

    try {
      if (!state.checkout.stayId) throw new Error("Önce konaklama seçin.");

      const method = document.getElementById("paymentMethod").value;
      const amount = Number(document.getElementById("paymentAmount").value || 0);
      const note = document.getElementById("paymentNote").value.trim();

      if (amount <= 0) throw new Error("Ödeme tutarı 0'dan büyük olmalı.");

      const res = await db.from("payments").insert({
        stay_id: state.checkout.stayId,
        method,
        amount,
        note: note || null,
      });
      if (res.error) throw new Error(res.error.message);

      ui.paymentForm.reset();
      await loadCheckoutForStay(state.checkout.stayId);
      await loadActiveStays();
      renderStaySelects();
      renderActiveStaysTable();
      await loadDailyReport(ui.reportDate.value || state.report.date);
      showToast("Ödeme kaydedildi.");
    } catch (error) {
      showToast(error.message || "Ödeme kaydedilemedi", true);
    }
  });

  ui.closeStayBtn.addEventListener("click", async () => {
    if (!requireAccess("checkout")) return;

    try {
      if (!state.checkout.stayId) throw new Error("Konaklama seçin.");

      const balance = Number(state.checkout.totals.balance || 0);
      if (balance > 0) {
        const proceed = window.confirm(
          `Bu konaklamada ${money(balance)} kalan bakiye var. Yine de kapatılsın mı?`
        );
        if (!proceed) return;
      }

      const res = await db
        .from("stays")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", state.checkout.stayId);

      if (res.error) throw new Error(res.error.message);

      state.checkout.stayId = null;
      await refreshAllData();
      await loadCheckoutForStay(null);
      await loadDailyReport(ui.reportDate.value || state.report.date);
      showToast("Konaklama kapatıldı.");
    } catch (error) {
      showToast(error.message || "Konaklama kapatılamadı", true);
    }
  });

  ui.menuForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireAccess("menu")) return;

    try {
      const outletId = Number(document.getElementById("menuOutlet").value);
      const category = document.getElementById("menuCategory").value.trim();
      const name = document.getElementById("menuName").value.trim();
      const price = Number(document.getElementById("menuPrice").value || 0);
      const imageUrl = document.getElementById("menuImageUrl").value.trim();

      if (!outletId || !name || price < 0) {
        throw new Error("Ürün bilgilerini kontrol edin.");
      }

      const res = await db.from("menu_items").insert({
        outlet_id: outletId,
        category: category || "Genel",
        name,
        price,
        image_url: imageUrl || null,
      });
      if (res.error) throw new Error(res.error.message);

      ui.menuForm.reset();
      await loadMenuItems();
      renderMenuGrid();
      renderMenuList();
      showToast("Ürün menüye eklendi.");
    } catch (error) {
      showToast(error.message || "Ürün eklenemedi", true);
    }
  });

  ui.refreshReportBtn.addEventListener("click", async () => {
    if (!requireAccess("reports")) return;

    try {
      await loadDailyReport(ui.reportDate.value || state.report.date);
      showToast("Rapor güncellendi.");
    } catch (error) {
      showToast(error.message || "Rapor alınamadı", true);
    }
  });

  ui.printReportBtn.addEventListener("click", () => {
    if (!requireAccess("reports")) return;
    printDailyReport();
  });
}

async function printOrder(orderId) {
  const orderRes = await db
    .from("orders")
    .select("id,created_at,stay_id,outlet_id,note")
    .eq("id", orderId)
    .single();

  const order = must(orderRes.data, orderRes.error, "Sipariş bulunamadı");

  const [itemsRes, outletsRes, stayRes] = await Promise.all([
    db
      .from("order_items")
      .select("item_name,quantity,unit_price")
      .eq("order_id", orderId)
      .order("id", { ascending: true }),
    db.from("outlets").select("id,name"),
    order.stay_id
      ? db
          .from("stays")
          .select(`
            id,
            room:rooms!stays_room_id_fkey(room_number),
            guest:guests!stays_guest_id_fkey(full_name)
          `)
          .eq("id", order.stay_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const items = must(itemsRes.data, itemsRes.error, "Sipariş kalemleri alınamadı");
  const outlets = must(outletsRes.data, outletsRes.error, "Outlet alınamadı");
  const stay = must(stayRes.data, stayRes.error, "Konaklama alınamadı");

  const outletMap = new Map(outlets.map((o) => [o.id, o.name]));
  const outletName = outletMap.get(order.outlet_id) || "-";
  const total = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0);

  ui.printArea.innerHTML = `
    <div class="receipt">
      <h3>HOTEL POS ADISYON</h3>
      <p>Adisyon No: #${order.id}</p>
      <p>Tarih: ${datetime(order.created_at)}</p>
      <p>Outlet: ${escapeHtml(outletName)}</p>
      <p>Oda: ${order.stay_id ? escapeHtml(stay?.room?.room_number || "-") : "Yuruyen"}</p>
      <p>Misafir: ${order.stay_id ? escapeHtml(stay?.guest?.full_name || "-") : "-"}</p>
      <hr>
      <table>
        <thead><tr><th>Urun</th><th>Adet</th><th>Tutar</th></tr></thead>
        <tbody>
          ${items
            .map(
              (i) => `
              <tr>
                <td>${escapeHtml(i.item_name)}</td>
                <td>${i.quantity}</td>
                <td>${money(Number(i.quantity) * Number(i.unit_price))}</td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
      <hr>
      <p><strong>TOPLAM: ${money(total)}</strong></p>
      <p>Not: ${escapeHtml(order.note || "-")}</p>
      <p>Afiyet olsun</p>
    </div>
  `;

  await db.from("orders").update({ printed_at: new Date().toISOString() }).eq("id", order.id);
  window.print();
}

function printDailyReport() {
  const s = state.report.summary;

  ui.printArea.innerHTML = `
    <div class="receipt">
      <h3>GUNLUK RAPOR</h3>
      <p>Tarih: ${escapeHtml(state.report.date)}</p>
      <hr>
      <p>Adisyon: ${s.orderCount}</p>
      <p>Oda Adisyonu: ${s.roomOrderCount}</p>
      <p>Yuruyen Adisyon: ${s.walkinOrderCount}</p>
      <p>Toplam Satis: ${money(s.grossSales)}</p>
      <p>Toplam Tahsilat: ${money(s.paymentTotal)}</p>
      <p>Net: ${money(s.net)}</p>
      <hr>
      <p><strong>Outlet Dagilimi</strong></p>
      ${state.report.byOutlet.map((x) => `<p>${escapeHtml(x.name)}: ${money(x.total)}</p>`).join("") || "<p>-</p>"}
      <hr>
      <p><strong>Odalar (Top 10)</strong></p>
      ${state.report.byRoom.map((x) => `<p>${escapeHtml(x.roomNumber)}: ${money(x.total)}</p>`).join("") || "<p>-</p>"}
    </div>
  `;

  window.print();
}

async function bootstrap() {
  try {
    ui.reportDate.value = state.report.date;

    setupTabs();
    setupEvents();

    const restored = await tryRestoreSession();
    if (!restored) {
      renderLoggedOut();
      return;
    }

    await refreshAllData();
    await loadCheckoutForStay(null);
    await loadDailyReport(ui.reportDate.value || state.report.date);
  } catch (error) {
    showToast(error.message || "Uygulama başlatılamadı", true);
  }
}

bootstrap();
