/* =========================================================
   مطاعم ومطابخ سحايب ديرتي
   نظام حسابات السائقين اليومية
   تخزين محلي - فواتير - تسويات - تقارير - طباعة
========================================================= */

"use strict";

/* =========================
   إعدادات النظام
========================= */

const DB_KEY = "deerty_new_daily_v1";

const $ = id => document.getElementById(id);

const todayISO = () => {
  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
};

const nowISO = () => new Date().toISOString();

const money = value =>
  `${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ر.س`;

const numberValue = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const roundMoney = value =>
  Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;

const makeId = prefix =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const escapeHTML = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);

const formatDate = value => {
  if (!value) return "-";

  const parts = String(value).split("-");

  if (parts.length !== 3) return escapeHTML(value);

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const formatDateTime = value => {
  if (!value) return "-";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("ar-SA");
};

/* =========================
   البيانات الافتراضية
========================= */

function createDefaultDB() {
  return {
    version: 1,

    settings: {
      businessName: "مطاعم ومطابخ سحايب ديرتي",
      businessPhone: "",
      receiptFooter: "شكرًا لثقتكم بمطاعم ديرتي"
    },

    drivers: [],

    items: [
      {
        id: "item_1",
        name: "وجبة",
        price: 20,
        active: true
      },
      {
        id: "item_2",
        name: "مشروب",
        price: 5,
        active: true
      }
    ],

    invoices: [],

    settlements: []
  };
}

/* =========================
   قراءة وحفظ قاعدة البيانات
========================= */

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);

    if (!raw) {
      return createDefaultDB();
    }

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.drivers) ||
      !Array.isArray(parsed.items) ||
      !Array.isArray(parsed.invoices) ||
      !Array.isArray(parsed.settlements)
    ) {
      throw new Error("صيغة قاعدة البيانات غير صحيحة");
    }

    if (!parsed.settings) {
      parsed.settings = createDefaultDB().settings;
    }

    return parsed;

  } catch (error) {
    console.error("خطأ في قراءة البيانات:", error);

    alert(
      "تعذر قراءة البيانات المحفوظة. " +
      "لا تحذف بيانات المتصفح. افحص النسخة الاحتياطية إن وجدت."
    );

    return createDefaultDB();
  }
}

let db = loadDB();

function saveDB() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return true;

  } catch (error) {
    console.error("خطأ في حفظ البيانات:", error);

    alert(
      "تعذر حفظ البيانات. قد تكون مساحة التخزين ممتلئة. " +
      "صدّر نسخة احتياطية واحذف الملفات غير الضرورية."
    );

    return false;
  }
}

/* =========================
   رسائل التنبيه
========================= */

let toastTimer = null;

function toast(message) {
  const element = $("toast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.classList.remove("show");
  }, 3000);
}

/* =========================
   التنقل بين الصفحات
========================= */

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active", page.id === pageId);
  });

  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageId
    );
  });

  if (pageId === "dashboardPage") {
    renderDashboard();
  }

  if (pageId === "invoicePage") {
    refreshInvoiceSelectors();
  }

  if (pageId === "invoicesPage") {
    renderInvoices();
  }

  if (pageId === "settlementPage") {
    renderSettlements();
  }

  if (pageId === "reportsPage") {
    renderReport();
  }

  if (pageId === "driversPage") {
    renderDrivers();
  }

  if (pageId === "itemsPage") {
    renderItems();
  }

  if (pageId === "settingsPage") {
    loadSettingsForm();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function initNavigation() {
  document.querySelectorAll(".tab").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });

  $("newInvoiceBtn").addEventListener("click", () => {
    resetInvoiceForm();
    showPage("invoicePage");
  });

  $("showInvoicesBtn").addEventListener("click", () => {
    showPage("invoicesPage");
  });
}

/* =========================
   إدارة السائقين
========================= */

function getDriver(driverId) {
  return db.drivers.find(driver => driver.id === driverId);
}

function getDriverName(driverId) {
  const driver = getDriver(driverId);

  return driver ? driver.name : "سائق محذوف";
}

function renderDrivers() {
  const tbody = $("driversTableBody");

  if (!db.drivers.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-row">
          لا يوجد سائقون حتى الآن
        </td>
      </tr>
    `;

    refreshDriverSelectors();
    return;
  }

  tbody.innerHTML = db.drivers.map(driver => `
    <tr>
      <td>${escapeHTML(driver.name)}</td>

      <td>${escapeHTML(driver.phone || "-")}</td>

      <td>
        <span class="${driver.active ? "status-active" : "status-inactive"}">
          ${driver.active ? "نشط" : "معطل"}
        </span>
      </td>

      <td>
        <button
          class="btn btn-outline"
          data-action="edit-driver"
          data-id="${escapeHTML(driver.id)}"
        >
          تعديل
        </button>

        <button
          class="btn btn-outline"
          data-action="toggle-driver"
          data-id="${escapeHTML(driver.id)}"
        >
          ${driver.active ? "تعطيل" : "تفعيل"}
        </button>
      </td>
    </tr>
  `).join("");

  refreshDriverSelectors();
}

function refreshDriverSelectors() {
  const selectorIds = [
    "invoiceDriver",
    "settlementDriver",
    "filterInvoiceDriver",
    "reportDriver"
  ];

  selectorIds.forEach(selectorId => {
    const select = $(selectorId);

    if (!select) return;

    const oldValue = select.value;

    const firstOption = selectorId === "filterInvoiceDriver" ||
                        selectorId === "reportDriver";

    select.innerHTML = firstOption
      ? '<option value="">جميع السائقين</option>'
      : '<option value="">اختر السائق</option>';

    db.drivers
      .filter(driver => driver.active)
      .forEach(driver => {
        const option = document.createElement("option");

        option.value = driver.id;
        option.textContent = driver.name;

        select.appendChild(option);
      });

    if (
      oldValue &&
      Array.from(select.options).some(option => option.value === oldValue)
    ) {
      select.value = oldValue;
    }
  });
}

function resetDriverForm() {
  $("driverForm").reset();
  $("driverId").value = "";
  $("saveDriverBtn").textContent = "حفظ السائق";
}

function initDriverForm() {
  $("driverForm").addEventListener("submit", event => {
    event.preventDefault();

    const id = $("driverId").value;
    const name = $("driverName").value.trim();
    const phone = $("driverPhone").value.trim();

    if (!name) {
      toast("اكتب اسم السائق");
      return;
    }

    const duplicate = db.drivers.find(driver =>
      driver.name.trim().toLowerCase() === name.toLowerCase() &&
      driver.id !== id
    );

    if (duplicate) {
      toast("يوجد سائق بهذا الاسم بالفعل");
      return;
    }

    if (id) {
      const driver = getDriver(id);

      if (!driver) {
        toast("تعذر العثور على السائق");
        return;
      }

      driver.name = name;
      driver.phone = phone;

      toast("تم تعديل بيانات السائق");

    } else {
      db.drivers.push({
        id: makeId("driver"),
        name,
        phone,
        active: true,
        createdAt: nowISO()
      });

      toast("تمت إضافة السائق");
    }

    saveDB();
    resetDriverForm();
    renderDrivers();
    renderDashboard();
  });

  $("cancelDriverEditBtn").addEventListener("click", resetDriverForm);

  $("driversTableBody").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const driver = getDriver(button.dataset.id);

    if (!driver) return;

    const action = button.dataset.action;

    if (action === "edit-driver") {
      $("driverId").value = driver.id;
      $("driverName").value = driver.name;
      $("driverPhone").value = driver.phone || "";

      $("saveDriverBtn").textContent = "حفظ التعديلات";

      $("driverName").focus();

      return;
    }

    if (action === "toggle-driver") {
      driver.active = driver.active === false;

      saveDB();
      renderDrivers();

      toast(driver.active ? "تم تفعيل السائق" : "تم تعطيل السائق");
    }
  });
}

/* =========================
   إدارة الأصناف والأسعار
========================= */

function getItem(itemId) {
  return db.items.find(item => item.id === itemId);
}

function renderItems() {
  const tbody = $("itemsTableBody");

  if (!db.items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-row">
          لا توجد أصناف
        </td>
      </tr>
    `;

    refreshItemSelectors();
    return;
  }

  tbody.innerHTML = db.items.map(item => `
    <tr>
      <td>${escapeHTML(item.name)}</td>

      <td>${money(item.price)}</td>

      <td>
        <span class="${item.active ? "status-active" : "status-inactive"}">
          ${item.active ? "نشط" : "معطل"}
        </span>
      </td>

      <td>
        <button
          class="btn btn-outline"
          data-action="edit-item"
          data-id="${escapeHTML(item.id)}"
        >
          تعديل
        </button>

        <button
          class="btn btn-outline"
          data-action="toggle-item"
          data-id="${escapeHTML(item.id)}"
        >
          ${item.active ? "تعطيل" : "تفعيل"}
        </button>
      </td>
    </tr>
  `).join("");

  refreshItemSelectors();
}

function refreshItemSelectors() {
  document.querySelectorAll(".invoice-item-select").forEach(select => {
    const row = select.closest("tr");

    if (!row) return;

    const priceInput = row.querySelector(".invoice-item-price");
    const oldValue = select.value;

    select.innerHTML = '<option value="">اختر الصنف</option>';

    db.items
      .filter(item => item.active)
      .forEach(item => {
        const option = document.createElement("option");

        option.value = item.id;
        option.textContent = item.name;

        select.appendChild(option);
      });

    if (
      oldValue &&
      Array.from(select.options).some(option => option.value === oldValue)
    ) {
      select.value = oldValue;
    }

    if (select.value && priceInput) {
      const selectedItem = getItem(select.value);

      if (selectedItem) {
        priceInput.value = selectedItem.price;
      }
    }
  });
}

function resetItemForm() {
  $("itemForm").reset();
  $("itemId").value = "";
  $("saveItemBtn").textContent = "حفظ الصنف";
}

function initItemForm() {
  $("itemForm").addEventListener("submit", event => {
    event.preventDefault();

    const id = $("itemId").value;
    const name = $("itemName").value.trim();
    const price = roundMoney($("itemPrice").value);

    if (!name) {
      toast("اكتب اسم الصنف");
      return;
    }

    if (price < 0) {
      toast("السعر لا يمكن أن يكون سالبًا");
      return;
    }

    const duplicate = db.items.find(item =>
      item.name.trim().toLowerCase() === name.toLowerCase() &&
      item.id !== id
    );

    if (duplicate) {
      toast("يوجد صنف بهذا الاسم");
      return;
    }

    if (id) {
      const item = getItem(id);

      if (!item) {
        toast("تعذر العثور على الصنف");
        return;
      }

      item.name = name;
      item.price = price;

      toast("تم تعديل الصنف");

    } else {
      db.items.push({
        id: makeId("item"),
        name,
        price,
        active: true,
        createdAt: nowISO()
      });

      toast("تمت إضافة الصنف");
    }

    saveDB();
    resetItemForm();
    renderItems();
  });

  $("cancelItemEditBtn").addEventListener("click", resetItemForm);

  $("itemsTableBody").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const item = getItem(button.dataset.id);

    if (!item) return;

    if (button.dataset.action === "edit-item") {
      $("itemId").value = item.id;
      $("itemName").value = item.name;
      $("itemPrice").value = item.price;

      $("saveItemBtn").textContent = "حفظ التعديلات";

      $("itemName").focus();

      return;
    }

    if (button.dataset.action === "toggle-item") {
      item.active = item.active === false;

      saveDB();
      renderItems();

      toast(item.active ? "تم تفعيل الصنف" : "تم تعطيل الصنف");
    }
  });
}

/* =========================
   إنشاء الفواتير
========================= */

function refreshInvoiceSelectors() {
  refreshDriverSelectors();
  refreshItemSelectors();
}

function addInvoiceItemRow(itemData = {}) {
  const tbody = $("invoiceItemsBody");

  const row = document.createElement("tr");

  row.innerHTML = `
    <td>
      <select class="invoice-item-select">
        <option value="">اختر الصنف</option>
      </select>
    </td>

    <td>
      <input
        type="number"
        class="invoice-item-price"
        min="0"
        step="0.01"
        value="${numberValue(itemData.price)}"
      >
    </td>

    <td>
      <input
        type="number"
        class="invoice-item-qty"
        min="1"
        step="1"
        value="${Math.max(1, numberValue(itemData.qty || 1))}"
      >
    </td>

    <td class="invoice-row-total">0.00 ر.س</td>

    <td>
      <button type="button" class="btn btn-danger remove-invoice-item">
        حذف
      </button>
    </td>
  `;

  tbody.appendChild(row);

  const select = row.querySelector(".invoice-item-select");

  refreshItemSelectors();

  if (itemData.itemId) {
    select.value = itemData.itemId;

    const item = getItem(itemData.itemId);

    if (item && itemData.price === undefined) {
      row.querySelector(".invoice-item-price").value = item.price;
    }
  }

  calculateInvoiceTotals();
}

function readInvoiceRows() {
  const rows = Array.from(
    $("invoiceItemsBody").querySelectorAll("tr")
  );

  return rows.map(row => {
    const select = row.querySelector(".invoice-item-select");
    const priceInput = row.querySelector(".invoice-item-price");
    const qtyInput = row.querySelector(".invoice-item-qty");

    const itemId = select.value;
    const item = getItem(itemId);

    const price = roundMoney(priceInput.value);
    const qty = Math.max(1, Math.floor(numberValue(qtyInput.value)));

    return {
      itemId,
      name: item ? item.name : "",
      price,
      qty,
      total: roundMoney(price * qty)
    };
  });
}

function calculateInvoiceTotals() {
  let subtotal = 0;

  $("invoiceItemsBody").querySelectorAll("tr").forEach(row => {
    const price = roundMoney(
      row.querySelector(".invoice-item-price").value
    );

    const qty = Math.max(
      1,
      Math.floor(
        numberValue(row.querySelector(".invoice-item-qty").value)
      )
    );

    const total = roundMoney(price * qty);

    row.querySelector(".invoice-row-total").textContent = money(total);

    subtotal += total;
  });

  subtotal = roundMoney(subtotal);

  const deliveryFee = Math.max(
    0,
    roundMoney($("deliveryFee").value)
  );

  $("itemsSubtotal").textContent = money(subtotal);
  $("displayDeliveryFee").textContent = money(deliveryFee);
  $("invoiceGrandTotal").textContent = money(
    roundMoney(subtotal + deliveryFee)
  );
}

function resetInvoiceForm() {
  $("invoiceForm").reset();

  $("invoiceDate").value = todayISO();
  $("deliveryFee").value = "0";

  $("invoiceItemsBody").innerHTML = "";

  addInvoiceItemRow();

  calculateInvoiceTotals();
}

function createInvoiceNumber() {
  const date = todayISO().replaceAll("-", "");

  const sameDayCount = db.invoices.filter(invoice =>
    invoice.date === todayISO()
  ).length + 1;

  return `D-${date}-${String(sameDayCount).padStart(4, "0")}`;
}

function initInvoiceForm() {
  $("addInvoiceItemBtn").addEventListener("click", () => {
    addInvoiceItemRow();
  });

  $("invoiceItemsBody").addEventListener("change", event => {
    const row = event.target.closest("tr");

    if (!row) return;

    if (event.target.classList.contains("invoice-item-select")) {
      const item = getItem(event.target.value);

      if (item) {
        row.querySelector(".invoice-item-price").value = item.price;
      }
    }

    calculateInvoiceTotals();
  });

  $("invoiceItemsBody").addEventListener("input", event => {
    if (
      event.target.classList.contains("invoice-item-price") ||
      event.target.classList.contains("invoice-item-qty")
    ) {
      calculateInvoiceTotals();
    }
  });

  $("invoiceItemsBody").addEventListener("click", event => {
    const button = event.target.closest(".remove-invoice-item");

    if (!button) return;

    button.closest("tr").remove();

    calculateInvoiceTotals();
  });

  $("deliveryFee").addEventListener("input", calculateInvoiceTotals);

  $("resetInvoiceBtn").addEventListener("click", () => {
    if (confirm("هل تريد تفريغ نموذج الفاتورة؟")) {
      resetInvoiceForm();
    }
  });

  $("invoiceForm").addEventListener("submit", event => {
    event.preventDefault();

    const driverId = $("invoiceDriver").value;

    if (!driverId || !getDriver(driverId)) {
      toast("اختر السائق أولًا");
      return;
    }

    const invoiceDate = $("invoiceDate").value;

    if (!invoiceDate) {
      toast("حدد تاريخ الفاتورة");
      return;
    }

    const rows = readInvoiceRows();

    const validRows = rows.filter(row =>
      row.itemId &&
      row.name &&
      row.price >= 0 &&
      row.qty > 0
    );

    if (!validRows.length) {
      toast("أضف صنفًا واحدًا على الأقل");
      return;
    }

    const subtotal = roundMoney(
      validRows.reduce((sum, row) => sum + row.total, 0)
    );

    const deliveryFee = Math.max(
      0,
      roundMoney($("deliveryFee").value)
    );

    const total = roundMoney(subtotal + deliveryFee);

    const invoice = {
      id: makeId("invoice"),
      number: createInvoiceNumber(),
      date: invoiceDate,
      createdAt: nowISO(),

      driverId,

      customer: $("invoiceCustomer").value.trim(),
      phone: $("invoicePhone").value.trim(),

      type: $("invoiceType").value,

      items: validRows,

      subtotal,
      deliveryFee,
      total,

      notes: $("invoiceNotes").value.trim(),

      status: "active"
    };

    db.invoices.push(invoice);

    if (!saveDB()) {
      db.invoices = db.invoices.filter(item => item.id !== invoice.id);
      return;
    }

    toast("تم حفظ الفاتورة");

    renderDashboard();
    renderInvoices();

    printInvoice(invoice);

    resetInvoiceForm();

    showPage("dashboardPage");
  });
}

/* =========================
   سجل الفواتير
========================= */

function getActiveInvoices() {
  return db.invoices.filter(invoice =>
    invoice.status !== "cancelled"
  );
}

function getInvoice(invoiceId) {
  return db.invoices.find(invoice => invoice.id === invoiceId);
}

function getInvoiceItemsCount(invoice) {
  return (invoice.items || []).reduce(
    (sum, item) => sum + numberValue(item.qty),
    0
  );
}

function renderInvoices() {
  const tbody = $("invoicesTableBody");

  const dateFilter = $("filterInvoiceDate").value;
  const driverFilter = $("filterInvoiceDriver").value;
  const search = $("invoiceSearch").value.trim().toLowerCase();

  let invoices = [...db.invoices];

  if (dateFilter) {
    invoices = invoices.filter(invoice =>
      invoice.date === dateFilter
    );
  }

  if (driverFilter) {
    invoices = invoices.filter(invoice =>
      invoice.driverId === driverFilter
    );
  }

  if (search) {
    invoices = invoices.filter(invoice =>
      String(invoice.number || "").toLowerCase().includes(search)
    );
  }

  invoices.sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );

  if (!invoices.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-row">
          لا توجد فواتير مطابقة للبحث
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML = invoices.map(invoice => `
    <tr>
      <td>${escapeHTML(invoice.number)}</td>

      <td>${formatDate(invoice.date)}</td>

      <td>${escapeHTML(getDriverName(invoice.driverId))}</td>

      <td>${getInvoiceItemsCount(invoice)}</td>

      <td>${money(invoice.total)}</td>

      <td>
        <span class="${invoice.status === "cancelled" ? "status-cancelled" : "status-active"}">
          ${invoice.status === "cancelled" ? "ملغاة" : "فعالة"}
        </span>
      </td>

      <td>
        <button
          class="btn btn-outline"
          data-action="print-invoice"
          data-id="${escapeHTML(invoice.id)}"
        >
          طباعة
        </button>

        ${
          invoice.status !== "cancelled"
            ? `
              <button
                class="btn btn-danger"
                data-action="cancel-invoice"
                data-id="${escapeHTML(invoice.id)}"
              >
                إلغاء
              </button>
            `
            : ""
        }
      </td>
    </tr>
  `).join("");
}

function initInvoiceFilters() {
  ["filterInvoiceDate", "filterInvoiceDriver"].forEach(id => {
    $(id).addEventListener("change", renderInvoices);
  });

  $("invoiceSearch").addEventListener("input", renderInvoices);

  $("clearInvoiceFilters").addEventListener("click", () => {
    $("filterInvoiceDate").value = "";
    $("filterInvoiceDriver").value = "";
    $("invoiceSearch").value = "";

    renderInvoices();
  });

  $("invoicesTableBody").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const invoice = getInvoice(button.dataset.id);

    if (!invoice) return;

    if (button.dataset.action === "print-invoice") {
      printInvoice(invoice);
      return;
    }

    if (button.dataset.action === "cancel-invoice") {
      if (isInvoiceSettled(invoice.id)) {
        toast("لا يمكن إلغاء فاتورة دخلت في تسوية محفوظة");
        return;
      }

      if (!confirm(`هل تريد إلغاء الفاتورة ${invoice.number}؟`)) {
        return;
      }

      invoice.status = "cancelled";
      invoice.cancelledAt = nowISO();

      saveDB();

      renderInvoices();
      renderDashboard();
      renderReport();

      toast("تم إلغاء الفاتورة مع الاحتفاظ بسجلها");
    }
  });
}

/* =========================
   الطباعة الحرارية
========================= */

function ensurePrintArea() {
  let area = $("printArea");

  if (!area) {
    area = document.createElement("div");
    area.id = "printArea";
    area.className = "print-area";

    document.body.appendChild(area);
  }

  return area;
}

function printInvoice(invoice) {
  if (!invoice) {
    toast("الفاتورة غير موجودة");
    return;
  }

  const area = ensurePrintArea();

  const rows = (invoice.items || []).map(item => `
    <tr>
      <td>${escapeHTML(item.name)}</td>
      <td>${numberValue(item.qty)}</td>
      <td>${money(item.price)}</td>
      <td>${money(item.total)}</td>
    </tr>
  `).join("");

  area.innerHTML = `
    <div class="receipt">

      <h2>${escapeHTML(db.settings.businessName)}</h2>

      ${
        db.settings.businessPhone
          ? `<p>هاتف: ${escapeHTML(db.settings.businessPhone)}</p>`
          : ""
      }

      <div class="receipt-line"></div>

      <h3>فاتورة سائق</h3>

      <p>رقم الفاتورة: ${escapeHTML(invoice.number)}</p>
      <p>التاريخ: ${formatDate(invoice.date)}</p>
      <p>وقت الإنشاء: ${formatDateTime(invoice.createdAt)}</p>
      <p>السائق: ${escapeHTML(getDriverName(invoice.driverId))}</p>
      <p>نوع الطلب: ${escapeHTML(invoice.type || "توصيل")}</p>

      ${
        invoice.customer
          ? `<p>العميل: ${escapeHTML(invoice.customer)}</p>`
          : ""
      }

      ${
        invoice.phone
          ? `<p>رقم العميل: ${escapeHTML(invoice.phone)}</p>`
          : ""
      }

      <div class="receipt-line"></div>

      <table>
        <thead>
          <tr>
            <th>الصنف</th>
            <th>الكمية</th>
            <th>السعر</th>
            <th>الإجمالي</th>
          </tr>
        </thead>

        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="receipt-line"></div>

      <p>إجمالي الأصناف: ${money(invoice.subtotal)}</p>
      <p>رسوم التوصيل: ${money(invoice.deliveryFee)}</p>

      <p class="receipt-total">
        الإجمالي النهائي: ${money(invoice.total)}
      </p>

      ${
        invoice.notes
          ? `<p>ملاحظات: ${escapeHTML(invoice.notes)}</p>`
          : ""
      }

      <div class="receipt-line"></div>

      <p class="receipt-footer">
        ${escapeHTML(db.settings.receiptFooter || "شكرًا لكم")}
      </p>

    </div>
  `;

  window.print();
}

/* =========================
   التسويات المالية
========================= */

/*
  قيمة الفرق = المبلغ المطلوب من السائق - المبلغ المستلم فعليًا

  إذا كان الفرق موجبًا:
  يوجد مبلغ ناقص لم تستلمه.

  إذا كان الفرق سالبًا:
  استلمت مبلغًا أكبر من إجمالي الفواتير.

  إذا كان صفرًا:
  الحساب مطابق.
*/

function isInvoiceSettled(invoiceId) {
  return db.settlements.some(settlement =>
    Array.isArray(settlement.invoiceIds) &&
    settlement.invoiceIds.includes(invoiceId)
  );
}

function getUnsettledInvoices(driverId, date) {
  return getActiveInvoices().filter(invoice =>
    invoice.driverId === driverId &&
    invoice.date === date &&
    !isInvoiceSettled(invoice.id)
  );
}

function getSettlementDifference(total, received) {
  return roundMoney(numberValue(total) - numberValue(received));
}

function differenceClass(value) {
  if (value > 0) return "difference-negative";
  if (value < 0) return "difference-positive";

  return "difference-zero";
}

function differenceLabel(value) {
  if (value > 0) {
    return `متبقي على السائق ${money(value)}`;
  }

  if (value < 0) {
    return `زيادة مستلمة ${money(Math.abs(value))}`;
  }

  return "الحساب مطابق";
}

function buildSettlementPreview() {
  const driverId = $("settlementDriver").value;
  const date = $("settlementDate").value;
  const received = roundMoney($("settlementReceived").value);

  const box = $("settlementPreview");

  if (!driverId || !date) {
    box.classList.remove("hidden");

    box.innerHTML = `
      <p class="negative-text">
        اختر التاريخ والسائق أولًا.
      </p>
    `;

    return null;
  }

  const invoices = getUnsettledInvoices(driverId, date);

  const total = roundMoney(
    invoices.reduce((sum, invoice) => sum + numberValue(invoice.total), 0)
  );

  const difference = getSettlementDifference(total, received);

  box.classList.remove("hidden");

  box.innerHTML = `
    <h4>معاينة الحساب</h4>

    <div class="preview-row">
      <span>السائق</span>
      <strong>${escapeHTML(getDriverName(driverId))}</strong>
    </div>

    <div class="preview-row">
      <span>التاريخ</span>
      <strong>${formatDate(date)}</strong>
    </div>

    <div class="preview-row">
      <span>عدد الفواتير غير المسوّاة</span>
      <strong>${invoices.length}</strong>
    </div>

    <div class="preview-row">
      <span>إجمالي الفواتير</span>
      <strong>${money(total)}</strong>
    </div>

    <div class="preview-row">
      <span>المبلغ المستلم فعليًا</span>
      <strong>${money(received)}</strong>
    </div>

    <div class="preview-row">
      <span>الفرق</span>
      <strong class="${differenceClass(difference)}">
        ${money(difference)}
      </strong>
    </div>

    <p class="${differenceClass(difference)}">
      ${differenceLabel(difference)}
    </p>
  `;

  return {
    driverId,
    date,
    received,
    invoices,
    total,
    difference
  };
}

function renderSettlements() {
  const tbody = $("settlementsTableBody");

  const settlements = [...db.settlements].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );

  if (!settlements.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-row">
          لا توجد تسويات محفوظة
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML = settlements.map(settlement => `
    <tr>
      <td>${escapeHTML(settlement.number || settlement.id)}</td>

      <td>${formatDate(settlement.date)}</td>

      <td>${escapeHTML(getDriverName(settlement.driverId))}</td>

      <td>${money(settlement.total)}</td>

      <td>${money(settlement.received)}</td>

      <td class="${differenceClass(settlement.difference)}">
        ${money(settlement.difference)}
      </td>

      <td>
        <button
          class="btn btn-outline"
          data-action="print-settlement"
          data-id="${escapeHTML(settlement.id)}"
        >
          طباعة
        </button>
      </td>
    </tr>
  `).join("");
}

function initSettlementForm() {
  $("previewSettlementBtn").addEventListener("click", () => {
    buildSettlementPreview();
  });

  $("settlementDriver").addEventListener("change", () => {
    $("settlementPreview").classList.add("hidden");
  });

  $("settlementDate").addEventListener("change", () => {
    $("settlementPreview").classList.add("hidden");
  });

  $("settlementReceived").addEventListener("input", () => {
    $("settlementPreview").classList.add("hidden");
  });

  $("settlementForm").addEventListener("submit", event => {
    event.preventDefault();

    const preview = buildSettlementPreview();

    if (!preview) return;

    if (!preview.invoices.length) {
      toast("لا توجد فواتير جديدة غير مسوّاة لهذا السائق في هذا التاريخ");
      return;
    }

    const settlement = {
      id: makeId("settlement"),

      number: `S-${todayISO().replaceAll("-", "")}-${String(
        db.settlements.length + 1
      ).padStart(4, "0")}`,

      date: preview.date,
      driverId: preview.driverId,

      invoiceIds: preview.invoices.map(invoice => invoice.id),

      total: preview.total,
      received: preview.received,
      difference: preview.difference,

      createdAt: nowISO()
    };

    const description = [
      `السائق: ${getDriverName(settlement.driverId)}`,
      `إجمالي الفواتير: ${money(settlement.total)}`,
      `المبلغ المستلم: ${money(settlement.received)}`,
      `الفرق: ${money(settlement.difference)}`
    ].join("\n");

    if (!confirm(`تأكيد حفظ التسوية؟\n\n${description}`)) {
      return;
    }

    db.settlements.push(settlement);

    if (!saveDB()) {
      db.settlements = db.settlements.filter(
        item => item.id !== settlement.id
      );

      return;
    }

    toast("تم حفظ التسوية");

    $("settlementReceived").value = "0";
    $("settlementPreview").classList.add("hidden");

    renderSettlements();
    renderDashboard();
    renderReport();

    printSettlement(settlement);
  });

  $("settlementsTableBody").addEventListener("click", event => {
    const button = event.target.closest(
      'button[data-action="print-settlement"]'
    );

    if (!button) return;

    const settlement = db.settlements.find(item =>
      item.id === button.dataset.id
    );

    if (settlement) {
      printSettlement(settlement);
    }
  });
}

function printSettlement(settlement) {
  const area = ensurePrintArea();

  const invoiceRows = (settlement.invoiceIds || [])
    .map(id => getInvoice(id))
    .filter(Boolean)
    .map(invoice => `
      <tr>
        <td>${escapeHTML(invoice.number)}</td>
        <td>${money(invoice.total)}</td>
      </tr>
    `)
    .join("");

  area.innerHTML = `
    <div class="receipt">

      <h2>${escapeHTML(db.settings.businessName)}</h2>

      <div class="receipt-line"></div>

      <h3>إيصال تسوية حساب سائق</h3>

      <p>رقم التسوية: ${escapeHTML(settlement.number || settlement.id)}</p>
      <p>التاريخ: ${formatDate(settlement.date)}</p>
      <p>السائق: ${escapeHTML(getDriverName(settlement.driverId))}</p>

      <div class="receipt-line"></div>

      <table>
        <thead>
          <tr>
            <th>رقم الفاتورة</th>
            <th>الإجمالي</th>
          </tr>
        </thead>

        <tbody>
          ${invoiceRows}
        </tbody>
      </table>

      <div class="receipt-line"></div>

      <p>عدد الفواتير: ${(settlement.invoiceIds || []).length}</p>

      <p>إجمالي الفواتير: ${money(settlement.total)}</p>

      <p>المبلغ المستلم فعليًا: ${money(settlement.received)}</p>

      <p class="receipt-total">
        الفرق: ${money(settlement.difference)}
      </p>

      <p>${escapeHTML(differenceLabel(settlement.difference))}</p>

      <div class="receipt-line"></div>

      <p>توقيع المستلم: __________________</p>
      <p>توقيع السائق: __________________</p>

      <p class="receipt-footer">
        ${escapeHTML(db.settings.receiptFooter || "شكرًا لكم")}
      </p>

    </div>
  `;

  window.print();
}

/* =========================
   لوحة التحكم
========================= */

function getDayInvoices(date = todayISO()) {
  return getActiveInvoices().filter(invoice =>
    invoice.date === date
  );
}

function getDaySettlements(date = todayISO()) {
  return db.settlements.filter(settlement =>
    settlement.date === date
  );
}

function sumInvoices(invoices) {
  return roundMoney(
    invoices.reduce((sum, invoice) => sum + numberValue(invoice.total), 0)
  );
}

function sumSettlements(settlements) {
  return roundMoney(
    settlements.reduce(
      (sum, settlement) => sum + numberValue(settlement.received),
      0
    )
  );
}

function renderDashboard() {
  $("todayLabel").textContent =
    `تاريخ اليوم: ${formatDate(todayISO())}`;

  $("headerBusinessName").textContent =
    db.settings.businessName || "مطاعم ومطابخ سحايب ديرتي";

  const invoices = getDayInvoices();

  const settlements = getDaySettlements();

  $("statInvoices").textContent = invoices.length;

  $("statTotal").textContent = money(sumInvoices(invoices));

  $("statReceived").textContent = money(sumSettlements(settlements));

  const remaining = roundMoney(
    invoices.reduce((sum, invoice) => {
      const settlement = db.settlements.find(item =>
        item.invoiceIds?.includes(invoice.id)
      );

      return sum + (
        settlement
          ? 0
          : numberValue(invoice.total)
      );
    }, 0)
  );

  $("statRemaining").textContent = money(remaining);

  const tbody = $("dashboardInvoicesBody");

  const recentInvoices = [...db.invoices]
    .sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    )
    .slice(0, 10);

  if (!recentInvoices.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row">
          لا توجد فواتير بعد
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML = recentInvoices.map(invoice => `
    <tr>
      <td>${escapeHTML(invoice.number)}</td>

      <td>${formatDate(invoice.date)}</td>

      <td>${escapeHTML(getDriverName(invoice.driverId))}</td>

      <td>${money(invoice.total)}</td>

      <td>
        <span class="${invoice.status === "cancelled" ? "status-cancelled" : "status-active"}">
          ${invoice.status === "cancelled" ? "ملغاة" : "فعالة"}
        </span>
      </td>

      <td>
        <button
          class="btn btn-outline"
          data-action="print-dashboard-invoice"
          data-id="${escapeHTML(invoice.id)}"
        >
          طباعة
        </button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("button[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const invoice = getInvoice(button.dataset.id);

      if (invoice) {
        printInvoice(invoice);
      }
    });
  });
}

/* =========================
   التقارير
========================= */

let lastReport = [];

function getReportInvoices() {
  const from = $("reportFrom").value;
  const to = $("reportTo").value;
  const driverId = $("reportDriver").value;

  return getActiveInvoices().filter(invoice => {
    if (from && invoice.date < from) return false;
    if (to && invoice.date > to) return false;
    if (driverId && invoice.driverId !== driverId) return false;

    return true;
  });
}

function getSettlementsForReport(invoices) {
  const invoiceIds = new Set(invoices.map(invoice => invoice.id));

  return db.settlements.filter(settlement =>
    (settlement.invoiceIds || []).some(id => invoiceIds.has(id))
  );
}

function renderReport() {
  const invoices = getReportInvoices();

  const grouped = new Map();

  invoices.forEach(invoice => {
    if (!grouped.has(invoice.driverId)) {
      grouped.set(invoice.driverId, {
        driverId: invoice.driverId,
        count: 0,
        total: 0,
        received: 0,
        difference: 0
      });
    }

    const row = grouped.get(invoice.driverId);

    row.count += 1;
    row.total += numberValue(invoice.total);
  });

  const settlements = getSettlementsForReport(invoices);

  settlements.forEach(settlement => {
    if (!grouped.has(settlement.driverId)) {
      grouped.set(settlement.driverId, {
        driverId: settlement.driverId,
        count: 0,
        total: 0,
        received: 0,
        difference: 0
      });
    }

    const row = grouped.get(settlement.driverId);

    row.received += numberValue(settlement.received);
    row.difference += numberValue(settlement.difference);
  });

  lastReport = Array.from(grouped.values()).map(row => ({
    ...row,
    total: roundMoney(row.total),
    received: roundMoney(row.received),
    difference: roundMoney(row.difference)
  }));

  const totalCount = invoices.length;
  const totalAmount = sumInvoices(invoices);

  const receivedAmount = roundMoney(
    settlements.reduce(
      (sum, settlement) => sum + numberValue(settlement.received),
      0
    )
  );

  const totalDifference = roundMoney(
    settlements.reduce(
      (sum, settlement) => sum + numberValue(settlement.difference),
      0
    )
  );

  $("reportInvoicesCount").textContent = totalCount;
  $("reportInvoicesTotal").textContent = money(totalAmount);
  $("reportReceivedTotal").textContent = money(receivedAmount);
  $("reportDifference").textContent = money(totalDifference);

  const tbody = $("reportTableBody");

  if (!lastReport.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-row">
          لا توجد بيانات في الفترة المحددة
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML = lastReport.map(row => `
    <tr>
      <td>${escapeHTML(getDriverName(row.driverId))}</td>

      <td>${row.count}</td>

      <td>${money(row.total)}</td>

      <td>${money(row.received)}</td>

      <td class="${differenceClass(row.difference)}">
        ${money(row.difference)}
      </td>
    </tr>
  `).join("");
}

function initReports() {
  $("reportFrom").value = todayISO();
  $("reportTo").value = todayISO();

  $("runReportBtn").addEventListener("click", renderReport);

  $("exportReportBtn").addEventListener("click", exportReportCSV);

  $("printReportBtn").addEventListener("click", printReport);
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob(
    ["\uFEFF", content],
    { type: mimeType }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportReportCSV() {
  renderReport();

  const rows = [
    [
      "السائق",
      "عدد الفواتير",
      "إجمالي الفواتير",
      "المستلم",
      "الفرق"
    ]
  ];

  lastReport.forEach(row => {
    rows.push([
      getDriverName(row.driverId),
      row.count,
      row.total.toFixed(2),
      row.received.toFixed(2),
      row.difference.toFixed(2)
    ]);
  });

  const csv = rows.map(row =>
    row.map(value =>
      `"${String(value ?? "").replaceAll('"', '""')}"`
    ).join(",")
  ).join("\r\n");

  downloadFile(
    `deerty-report-${todayISO()}.csv`,
    csv,
    "text/csv;charset=utf-8"
  );

  toast("تم تصدير التقرير");
}

function printReport() {
  renderReport();

  const area = ensurePrintArea();

  const rows = lastReport.map(row => `
    <tr>
      <td>${escapeHTML(getDriverName(row.driverId))}</td>
      <td>${row.count}</td>
      <td>${money(row.total)}</td>
      <td>${money(row.received)}</td>
      <td>${money(row.difference)}</td>
    </tr>
  `).join("");

  area.innerHTML = `
    <div class="receipt">

      <h2>${escapeHTML(db.settings.businessName)}</h2>

      <h3>تقرير حسابات السائقين</h3>

      <p>من تاريخ: ${formatDate($("reportFrom").value || "")}</p>
      <p>إلى تاريخ: ${formatDate($("reportTo").value || "")}</p>

      <div class="receipt-line"></div>

      <table>
        <thead>
          <tr>
            <th>السائق</th>
            <th>الفواتير</th>
            <th>الإجمالي</th>
            <th>المستلم</th>
            <th>الفرق</th>
          </tr>
        </thead>

        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="receipt-line"></div>

      <p>عدد الفواتير: ${$("reportInvoicesCount").textContent}</p>
      <p>إجمالي الفواتير: ${$("reportInvoicesTotal").textContent}</p>
      <p>المبالغ المستلمة: ${$("reportReceivedTotal").textContent}</p>
      <p>الفرق: ${$("reportDifference").textContent}</p>

      <p class="receipt-footer">
        ${escapeHTML(db.settings.receiptFooter || "")}
      </p>

    </div>
  `;

  window.print();
}

/* =========================
   إعدادات المنشأة
========================= */

function loadSettingsForm() {
  $("businessName").value = db.settings.businessName || "";
  $("businessPhone").value = db.settings.businessPhone || "";
  $("receiptFooter").value = db.settings.receiptFooter || "";
}

function initSettingsForm() {
  $("settingsForm").addEventListener("submit", event => {
    event.preventDefault();

    db.settings.businessName =
      $("businessName").value.trim() ||
      "مطاعم ومطابخ سحايب ديرتي";

    db.settings.businessPhone =
      $("businessPhone").value.trim();

    db.settings.receiptFooter =
      $("receiptFooter").value.trim();

    if (!saveDB()) return;

    renderDashboard();

    toast("تم حفظ إعدادات المنشأة");
  });
}

/* =========================
   النسخ الاحتياطي والاستعادة
========================= */

function exportBackup() {
  const backup = {
    app: "DeertyDrivers",
    exportedAt: nowISO(),
    data: db
  };

  downloadFile(
    `deerty-backup-${todayISO()}.json`,
    JSON.stringify(backup, null, 2),
    "application/json;charset=utf-8"
  );

  toast("تم تصدير النسخة الاحتياطية");
}

function initBackup() {
  $("backupBtn").addEventListener("click", exportBackup);

  $("restoreBtn").addEventListener("click", () => {
    $("restoreFile").click();
  });

  $("restoreFile").addEventListener("change", async event => {
    const file = event.target.files[0];

    if (!file) return;

    try {
      const textContent = await file.text();

      const parsed = JSON.parse(textContent);

      const restored = parsed.data || parsed;

      if (
        !restored ||
        !Array.isArray(restored.drivers) ||
        !Array.isArray(restored.items) ||
        !Array.isArray(restored.invoices) ||
        !Array.isArray(restored.settlements)
      ) {
        throw new Error("ملف النسخة الاحتياطية غير صحيح");
      }

      const confirmed = confirm(
        "استعادة النسخة الاحتياطية ستستبدل البيانات الحالية. " +
        "صدّر نسخة من البيانات الحالية أولًا إن كنت تحتاجها. هل تريد المتابعة؟"
      );

      if (!confirmed) return;

      const previousDB = db;

      db = restored;

      if (!db.settings) {
        db.settings = createDefaultDB().settings;
      }

      if (!saveDB()) {
        db = previousDB;
        return;
      }

      renderAll();

      toast("تمت استعادة النسخة الاحتياطية بنجاح");

    } catch (error) {
      console.error(error);

      alert(
        "تعذرت استعادة الملف. تأكد أنك اخترت نسخة احتياطية صحيحة."
      );

    } finally {
      event.target.value = "";
    }
  });

  $("resetAllBtn").addEventListener("click", () => {
    const firstConfirm = confirm(
      "تحذير: سيتم حذف جميع الفواتير والسائقين والتسويات والأصناف. " +
      "هل أنت متأكد؟"
    );

    if (!firstConfirm) return;

    const secondConfirm = confirm(
      "هذا الإجراء لا يمكن التراجع عنه من داخل التطبيق. " +
      "هل صدّرت نسخة احتياطية وتريد الحذف فعلًا؟"
    );

    if (!secondConfirm) return;

    const oldDB = db;

    db = createDefaultDB();

    if (!saveDB()) {
      db = oldDB;
      return;
    }

    renderAll();

    resetInvoiceForm();
    resetDriverForm();
    resetItemForm();

    toast("تمت إعادة ضبط البيانات");
  });
}

/* =========================
   تحديث الواجهة
========================= */

function renderAll() {
  refreshDriverSelectors();
  refreshItemSelectors();

  renderDashboard();
  renderDrivers();
  renderItems();
  renderInvoices();
  renderSettlements();
  renderReport();

  loadSettingsForm();
}

/* =========================
   تثبيت التطبيق PWA
========================= */

let deferredInstallPrompt = null;

function initPWA() {
  const installBtn = $("installBtn");

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();

    deferredInstallPrompt = event;

    installBtn.classList.remove("hidden");
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      toast(
        "إذا لم يظهر التثبيت، افتح التطبيق عبر HTTPS ثم استخدم قائمة المتصفح واختر تثبيت التطبيق."
      );

      return;
    }

    deferredInstallPrompt.prompt();

    const choice = await deferredInstallPrompt.userChoice;

    if (choice.outcome === "accepted") {
      toast("تم قبول طلب تثبيت التطبيق");
    } else {
      toast("تم إلغاء التثبيت");
    }

    deferredInstallPrompt = null;

    installBtn.classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    installBtn.classList.add("hidden");
    toast("تم تثبيت التطبيق");
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js")
        .then(() => {
          console.log("Service Worker registered");
        })
        .catch(error => {
          console.error("Service Worker registration failed:", error);
        });
    });
  }
}

/* =========================
   تهيئة التطبيق
========================= */

function initApp() {
  $("invoiceDate").value = todayISO();
  $("settlementDate").value = todayISO();

  $("reportFrom").value = todayISO();
  $("reportTo").value = todayISO();

  initNavigation();

  initDriverForm();
  initItemForm();

  initInvoiceForm();
  initInvoiceFilters();

  initSettlementForm();
  initReports();

  initSettingsForm();
  initBackup();

  initPWA();

  renderAll();

  resetInvoiceForm();

  showPage("dashboardPage");

  console.log("Deerty Drivers App ready");
}

document.addEventListener("DOMContentLoaded", initApp);
