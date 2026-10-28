(() => {
"use strict";

const KEY = "deerty_driver_accounts_v2";
/* =========================
   الأصناف الأساسية الثابتة
========================= */

const DEFAULT_ITEMS = [
  { id: "base_001", name: "ربع دجاج رز شعبي", price: 8.50 },
  { id: "base_002", name: "ربع دجاج رز بشاور", price: 9 },
  { id: "base_003", name: "نص مضغوط", price: 18 },
  { id: "base_004", name: "نص دجاج رز بشاور", price: 18 },
  { id: "base_005", name: "ببسي صغير", price: 3 },
  { id: "base_006", name: "ببسي وسط", price: 5 },
  { id: "base_007", name: "ببسي كبير", price: 9 },
  { id: "base_008", name: "مشكل خضار", price: 8 },
  { id: "base_009", name: "مشكل فرن", price: 8 },
  { id: "base_010", name: "مسقع", price: 10 },
  { id: "base_011", name: "نفر رز ساده", price: 9 }
];
const $ = id => document.getElementById(id);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const money = n =>
  `${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ر.س`;

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

let db = loadDB();
let draft = [];


/* =========================
   تحميل البيانات وحفظها
========================= */

function loadDB() {
try {
const x = JSON.parse(localStorage.getItem(KEY));

if (
  x &&
  Array.isArray(x.drivers) &&
  Array.isArray(x.items) &&
  Array.isArray(x.invoices)
) {
  const migrationKey = "deerty_base_items_migrated_v1";

  if (localStorage.getItem(migrationKey) !== "yes") {
    // استبدال الأصناف القديمة بالأساسية أول مرة فقط
    x.items = DEFAULT_ITEMS.map(item => ({
      ...item,
      inactive: false,
      isDefault: true
    }));

    localStorage.setItem(migrationKey, "yes");
  } else {
    // تثبيت الأصناف الأساسية مع الاحتفاظ بالأصناف المضافة لاحقًا
    const customItems = x.items.filter(
      item => !DEFAULT_ITEMS.some(base => base.id === item.id)
    );

    x.items = [
      ...DEFAULT_ITEMS.map(item => ({
        ...item,
        inactive: false,
        isDefault: true
      })),
      ...customItems
    ];
  }

  localStorage.setItem(KEY, JSON.stringify(x));
  return x;
}

} catch (e) {}

return {
drivers: [],
items: DEFAULT_ITEMS.map(item => ({
...item,
inactive: false,
isDefault: true
})),
invoices: [],
dayStarted: today()
};
}

function saveDB() {
  localStorage.setItem(KEY, JSON.stringify(db));
  renderAll();
}


/* =========================
   التنبيهات والمعلومات
========================= */

function toast(msg) {
  const t = $("toast");

  if (!t) return;

  t.textContent = msg;
  t.classList.add("show");

  setTimeout(() => {
    t.classList.remove("show");
  }, 2600);
}

function driverLabel(id) {
  return db.drivers.find(x => x.id === id)?.name ||
    "سائق محذوف/غير معروف";
}

function activeInvoices() {
  return db.invoices.filter(x => !x.cancelled);
}

function isToday(inv) {
  return inv.date === today() && !inv.archived;
}

function sumQty(lines) {
  return (lines || []).reduce(
    (s, x) => s + Number(x.qty || 0),
    0
  );
}

function invoiceTotal(inv) {
  return (inv.items || []).reduce(
    (s, x) => s + Number(x.qty || 0) * Number(x.price || 0),
    0
  );
}


/* =========================
   التنقل بين الصفحات
========================= */

function nav(page) {
  document.querySelectorAll(".page").forEach(x => {
    x.classList.toggle("active", x.id === `page-${page}`);
  });

  document.querySelectorAll(".tab").forEach(x => {
    x.classList.toggle("active", x.dataset.page === page);
  });

  if (page === "newInvoice") {
    renderItemPicker();
  }

  if (page === "reports") {
    fillReportDrivers();
    renderReport();
  }

  if (page === "archive") {
    renderArchive();
  }
}

document.querySelectorAll(".tab").forEach(b => {
  b.addEventListener("click", () => nav(b.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(b => {
  b.addEventListener("click", () => nav(b.dataset.go));
});


/* =========================
   تحديث الواجهة
========================= */

function renderAll() {
  renderStats();
  renderDrivers();
  renderItems();
  renderToday();
  renderItemPicker();
  fillDriverSelects();
  renderArchive();

  if ($("page-reports").classList.contains("active")) {
    renderReport();
  }
}


/* =========================
   إحصائيات اليوم
========================= */

function renderStats() {
  const list = activeInvoices().filter(isToday);

  $("statDrivers").textContent =
    db.drivers.filter(x => !x.inactive).length;

  $("statInvoices").textContent = list.length;

  $("statQty").textContent =
    list.reduce((s, x) => s + sumQty(x.items), 0);

  $("statTotal").textContent =
    money(list.reduce((s, x) => s + invoiceTotal(x), 0));
}


/* =========================
   فواتير اليوم
========================= */

function renderToday() {
  const list = activeInvoices()
    .filter(isToday)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  $("todayInvoices").innerHTML = list.length
    ? tableInvoices(list)
    : '<div class="empty">لا توجد فواتير صرف محفوظة لليوم.</div>';
}


/* =========================
   جدول الفواتير
========================= */

function tableInvoices(list) {
  return `
    <table>
      <thead>
        <tr>
          <th>رقم الفاتورة</th>
          <th>التاريخ</th>
          <th>السائق</th>
          <th>عدد الأصناف</th>
          <th>الإجمالي</th>
          <th>الحالة</th>
          <th>الإجراءات</th>
        </tr>
      </thead>

      <tbody>
        ${list.map(inv => `
          <tr>
            <td>${esc(inv.number || String(inv.id).slice(-6))}</td>

            <td>${esc(inv.date)}</td>

            <td>${esc(driverLabel(inv.driverId))}</td>

            <td>
              ${(inv.items || []).length} صنف /
              ${sumQty(inv.items)} كمية
            </td>

            <td>${money(invoiceTotal(inv))}</td>

            <td>
              ${inv.cancelled ? "ملغاة" : inv.archived ? "أرشيف" : "فعالة"}
            </td>

            <td>
  <button class="btn small secondary"
    onclick="printSingle('${inv.id}')">
    طباعة
  </button>
</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}


/* =========================
   قوائم اختيار السائقين
========================= */

function fillDriverSelects() {
  const active = db.drivers.filter(d => !d.inactive);

  for (const id of ["invoiceDriver", "reportDriver"]) {
    const el = $(id);

    if (!el) continue;

    const old = el.value;

    el.innerHTML =
      '<option value="">اختر السائق</option>' +
      active.map(d => `
        <option value="${esc(d.id)}">${esc(d.name)}</option>
      `).join("");

    if (active.some(d => d.id === old)) {
      el.value = old;
    }
  }
}


/* =========================
   إدارة السائقين
========================= */

function renderDrivers() {
  const rows = db.drivers.map(d => `
    <tr>
      <td>${esc(d.name)}</td>

      <td>${esc(d.phone || "—")}</td>

      <td>${d.inactive ? "موقوف" : "نشط"}</td>

      <td>
        <button class="btn small secondary"
          onclick="editDriver('${d.id}')">
          تعديل
        </button>

        <button class="btn small secondary"
          onclick="toggleDriver('${d.id}')">
          ${d.inactive ? "تفعيل" : "إيقاف"}
        </button>
      </td>
    </tr>
  `).join("");

  $("driversTable").innerHTML = db.drivers.length
    ? `
      <table>
        <thead>
          <tr>
            <th>السائق</th>
            <th>الجوال</th>
            <th>الحالة</th>
            <th>الإجراءات</th>
          </tr>
        </thead>

        <tbody>${rows}</tbody>
      </table>
    `
    : '<div class="empty">أضف أسماء السائقين أولًا.</div>';

  fillDriverSelects();
}


/* =========================
   إدارة الأصناف
========================= */

function renderItems() {
  const rows = db.items.map(i => `
    <tr>
      <td>📦 ${esc(i.name)}</td>

      <td>${money(i.price)}</td>

      <td>${i.inactive ? "موقوف" : "نشط"}</td>

      <td>
        <button class="btn small secondary"
          onclick="editItem('${i.id}')">
          تعديل
        </button>

        <button class="btn small secondary"
          onclick="toggleItem('${i.id}')">
          ${i.inactive ? "تفعيل" : "إيقاف"}
        </button>
      </td>
    </tr>
  `).join("");

  $("itemsTable").innerHTML = db.items.length
    ? `
      <table>
        <thead>
          <tr>
            <th>الصنف</th>
            <th>سعر الوحدة</th>
            <th>الحالة</th>
            <th>الإجراءات</th>
          </tr>
        </thead>

        <tbody>${rows}</tbody>
      </table>
    `
    : '<div class="empty">أضف الأصناف وأسعارها.</div>';
}


/* =========================
   اختيار أصناف الفاتورة
========================= */

function renderItemPicker() {
  const items = db.items.filter(i => !i.inactive);

  $("itemPicker").innerHTML = items.length
    ? items.map(i => `
      <button
        type="button"
        class="item-card"
        onclick="addDraftItem('${i.id}')">

        <span class="item-icon">＋</span>

        <b>${esc(i.name)}</b>

        <small>${money(i.price)}</small>
      </button>
    `).join("")
    : '<div class="empty">أضف أصنافًا من صفحة الأصناف والأسعار أولًا.</div>';

  renderDraft();
}

function addDraftItem(id) {
  const item = db.items.find(x => x.id === id);

  if (!item) return;

  if (draft.some(x => x.itemId === id)) {
    return toast("الصنف موجود؛ عدّل الكمية في الجدول.");
  }

  draft.push({
    itemId: item.id,
    name: item.name,
    price: Number(item.price),
    qty: ""
  });

  renderDraft();
}

window.addDraftItem = addDraftItem;


/* =========================
   عرض أصناف الفاتورة
========================= */

function renderDraft() {
  $("invoiceLines").innerHTML = draft.length
    ? draft.map((x, i) => `
      <tr>
        <td>${esc(x.name)}</td>

        <td>
          <input
            class="qty-input"
            type="number"
            min="0.01"
            step="any"
            placeholder="الكمية"
            value="${x.qty === "" ? "" : esc(x.qty)}"
            oninput="changeQty(${i}, this.value)">
        </td>

        <td>${money(x.price)}</td>

        <td>${money(Number(x.qty || 0) * x.price)}</td>

        <td>
          <button class="btn small danger"
            onclick="removeDraft(${i})">
            حذف
          </button>
        </td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="5" class="empty">
          اضغط على بطاقة الصنف لإضافته إلى الفاتورة.
        </td>
      </tr>
    `;

  $("invoiceTotal").textContent = money(
    draft.reduce((s, x) => s + Number(x.qty || 0) * x.price, 0)
  );
}

window.changeQty = (i, v) => {
  if (!draft[i]) return;

  draft[i].qty = v;

  const row = $("invoiceLines").rows[i];

  if (row) {
    row.cells[3].textContent =
      money(Number(v || 0) * draft[i].price);
  }

  $("invoiceTotal").textContent = money(
    draft.reduce((s, x) => s + Number(x.qty || 0) * x.price, 0)
  );
};

window.removeDraft = i => {
  draft.splice(i, 1);
  renderDraft();
};


/* =========================
   تفريغ نموذج الفاتورة
========================= */

$("clearInvoiceBtn").onclick = clearInvoiceForm;
$("cancelEditBtn").onclick = clearInvoiceForm;

function clearInvoiceForm() {
  draft = [];

  $("editInvoiceId").value = "";

  $("invoiceFormTitle").textContent = "فاتورة صرف جديدة";

  $("saveInvoiceBtn").textContent = "حفظ الفاتورة";

  $("cancelEditBtn").classList.add("hidden");

  $("invoiceNotes").value = "";

  $("invoiceDate").value = today();

  renderDraft();
}


/* =========================
   حفظ الفاتورة وطباعتها
========================= */

$("saveInvoiceBtn").onclick = () => {
  const driverId = $("invoiceDriver").value;
  const date = $("invoiceDate").value;

  const lines = draft
    .filter(x => Number(x.qty) > 0)
    .map(x => ({
      itemId: x.itemId,
      name: x.name,
      price: Number(x.price),
      qty: Number(x.qty)
    }));

  if (!driverId) {
    return toast("اختر السائق.");
  }

  if (!date) {
    return toast("حدد تاريخ الفاتورة.");
  }

  if (!lines.length) {
    return toast("أضف صنفًا وأدخل كمية أكبر من صفر.");
  }

  const editId = $("editInvoiceId").value;

  const old = editId
    ? db.invoices.find(x => x.id === editId)
    : null;

  const inv = {
    id: editId || uid(),

    number: old?.number ||
      `DF-${Date.now().toString().slice(-8)}`,

    date,
    driverId,
    items: lines,
    notes: $("invoiceNotes").value.trim(),

    createdAt: old?.createdAt || Date.now(),
    updatedAt: Date.now(),

    archived: old?.archived || false,
    cancelled: false
  };

  if (old) {
    Object.assign(old, inv);
  } else {
    db.invoices.push(inv);
  }

  saveDB();

  window.printSingle(inv.id);

  clearInvoiceForm();

  toast(
    old
      ? "تم تحديث الفاتورة وإرسالها للطباعة"
      : "تم حفظ الفاتورة وإرسالها للطباعة"
  );

  nav("dashboard");
};


/* =========================
   تعديل الفاتورة
========================= */

window.editInvoice = id => {
  const inv = db.invoices.find(x => x.id === id);

  if (!inv) return;

  if (
    inv.cancelled &&
    !confirm("هذه الفاتورة ملغاة. هل تريد إعادة فتحها للتعديل؟")
  ) {
    return;
  }

  nav("newInvoice");

  $("editInvoiceId").value = inv.id;

  $("invoiceFormTitle").textContent =
    "تعديل فاتورة " + inv.number;

  $("saveInvoiceBtn").textContent = "حفظ التعديلات";

  $("cancelEditBtn").classList.remove("hidden");

  $("invoiceDriver").value = inv.driverId;

  $("invoiceDate").value = inv.date;

  $("invoiceNotes").value = inv.notes || "";

  draft = (inv.items || []).map(x => ({
    ...x,
    qty: String(x.qty)
  }));

  inv.cancelled = false;

  renderDraft();
};


/* =========================
   إلغاء الفاتورة
========================= */

window.cancelInvoice = id => {
  const inv = db.invoices.find(x => x.id === id);

  if (!inv) return;

  if (!confirm(
    `هل تريد إلغاء الفاتورة ${inv.number}؟ ستبقى في الأرشيف ولن تدخل في الإجماليات.`
  )) {
    return;
  }

  inv.cancelled = true;

  saveDB();

  toast("تم إلغاء الفاتورة مع الاحتفاظ بها");
};


/* =========================
   إضافة وتعديل السائقين
========================= */

$("driverForm").onsubmit = e => {
  e.preventDefault();

  const id = $("driverId").value;
  const name = $("driverName").value.trim();

  if (!name) return;

  const duplicate = db.drivers.some(d =>
    d.name.toLowerCase() === name.toLowerCase() &&
    d.id !== id
  );

  if (duplicate) {
    return toast("اسم السائق موجود مسبقًا.");
  }

  if (id) {
    const d = db.drivers.find(x => x.id === id);

    if (!d) return;

    d.name = name;
    d.phone = $("driverPhone").value.trim();

  } else {
    db.drivers.push({
      id: uid(),
      name,
      phone: $("driverPhone").value.trim(),
      inactive: false
    });
  }

  db.drivers.sort((a, b) =>
    a.name.localeCompare(b.name, "ar")
  );

  saveDB();

  $("driverForm").reset();
  $("driverId").value = "";

  $("driverSaveBtn").textContent = "إضافة سائق";

  $("driverCancelBtn").classList.add("hidden");

  toast("تم حفظ بيانات السائق");
};

$("driverCancelBtn").onclick = () => {
  $("driverForm").reset();

  $("driverId").value = "";

  $("driverSaveBtn").textContent = "إضافة سائق";

  $("driverCancelBtn").classList.add("hidden");
};

window.editDriver = id => {
  const d = db.drivers.find(x => x.id === id);

  if (!d) return;

  $("driverId").value = id;

  $("driverName").value = d.name;

  $("driverPhone").value = d.phone || "";

  $("driverSaveBtn").textContent = "حفظ التعديل";

  $("driverCancelBtn").classList.remove("hidden");

  $("driverName").focus();
};

window.toggleDriver = id => {
  const d = db.drivers.find(x => x.id === id);

  if (!d) return;

  d.inactive = !d.inactive;

  saveDB();
};


/* =========================
   إضافة وتعديل الأصناف
========================= */

$("itemForm").onsubmit = e => {
  e.preventDefault();

  const id = $("itemId").value;
  const name = $("itemName").value.trim();
  const price = Number($("itemPrice").value);

  if (!name || !Number.isFinite(price) || price < 0) {
    return toast("أدخل اسم الصنف وسعرًا صحيحًا.");
  }

  if (id) {
    const it = db.items.find(x => x.id === id);

    if (!it) return;

    it.name = name;
    it.price = price;

  } else {
    db.items.push({
      id: uid(),
      name,
      price,
      inactive: false
    });
  }

  db.items.sort((a, b) =>
    a.name.localeCompare(b.name, "ar")
  );

  saveDB();

  $("itemForm").reset();

  $("itemId").value = "";

  $("itemSaveBtn").textContent = "إضافة صنف";

  $("itemCancelBtn").classList.add("hidden");

  toast("تم حفظ الصنف والسعر");
};

$("itemCancelBtn").onclick = () => {
  $("itemForm").reset();

  $("itemId").value = "";

  $("itemSaveBtn").textContent = "إضافة صنف";

  $("itemCancelBtn").classList.add("hidden");
};

window.editItem = id => {
  const it = db.items.find(x => x.id === id);

  if (!it) return;

  $("itemId").value = id;

  $("itemName").value = it.name;

  $("itemPrice").value = it.price;

  $("itemSaveBtn").textContent = "حفظ التعديل";

  $("itemCancelBtn").classList.remove("hidden");
};

window.toggleItem = id => {
  const it = db.items.find(x => x.id === id);

  if (!it) return;

  it.inactive = !it.inactive;

  saveDB();
};


/* =================================================
   التقارير وكشف الحساب
   التقرير الموحد يجمع كل السائقين في تقرير واحد
================================================= */

function fillReportDrivers() {
  fillDriverSelects();

  $("reportDriverWrap").classList.toggle(
    "hidden",
    $("reportType").value === "all"
  );
}

$("reportType").onchange = () => {
  fillReportDrivers();
  renderReport();
};

$("reportFrom").value = today();
$("reportTo").value = today();


/* تحديد الفواتير حسب التاريخ والسائق */

function filteredReportInvoices() {
  const from = $("reportFrom").value;
  const to = $("reportTo").value;
  const type = $("reportType").value;
  const driver = $("reportDriver").value;

  return activeInvoices()
    .filter(i =>
      (!from || i.date >= from) &&
      (!to || i.date <= to) &&
      (type === "all" || i.driverId === driver)
    )
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      (a.createdAt || 0) - (b.createdAt || 0)
    );
}

$("showReportBtn").onclick = renderReport;


/* =================================================
   تجميع الأصناف المتشابهة من جميع الفواتير

   إذا صرف أكثر من سائق الصنف نفسه، تظهر كمية الصنف
   مجمعة في سطر واحد في التقرير الموحد.
================================================= */

function aggregate(invoices) {
  const map = new Map();

  for (const inv of invoices) {
    for (const x of (inv.items || [])) {
      const key =
        x.itemId ||
        String(x.name || "").trim().toLowerCase();

      const row = map.get(key) || {
        name: x.name || "صنف بدون اسم",
        qty: 0,
        total: 0,
        price: 0
      };

      row.qty += Number(x.qty || 0);

      row.total +=
        Number(x.qty || 0) * Number(x.price || 0);

      /*
       * متوسط سعر الوحدة المرجّح.
       * يفيد إذا تغير سعر الصنف بين الفواتير.
       */
      row.price = row.qty
        ? row.total / row.qty
        : 0;

      map.set(key, row);
    }
  }

  return [...map.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "ar")
  );
}


function reportDateText() {
  return `من ${esc($("reportFrom").value || "البداية")} إلى ${esc($("reportTo").value || "اليوم")}`;
}


/* بطاقة التقرير */

function reportCard(title, invoices, isAll = false) {
  const items = aggregate(invoices);

  const total = invoices.reduce(
    (s, inv) => s + invoiceTotal(inv),
    0
  );

  const qty = items.reduce(
    (s, x) => s + x.qty,
    0
  );

  const driverCount = new Set(
    invoices.map(i => i.driverId)
  ).size;

  return `
    <div class="report-card">

      <div class="report-heading">
        <h2>مطاعم ومطابخ سحايب ديرتي</h2>

        <h3>
          ${isAll
            ? "التقرير الموحد لجميع السائقين"
            : "كشف حساب صرف الأصناف"}
        </h3>

        <b>
          ${isAll
            ? "جميع السائقين"
            : `السائق: ${esc(title)}`}
        </b>

        <p>${reportDateText()}</p>
      </div>

      <div class="report-summary">
        <span>عدد الفواتير: ${invoices.length}</span>
        <span>مجموع الكميات: ${qty}</span>
        <span>عدد السائقين: ${driverCount}</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الصنف</th>
              <th>مجموع الكمية</th>
              <th>متوسط سعر الوحدة</th>
              <th>الإجمالي</th>
            </tr>
          </thead>

          <tbody>
            ${items.map(x => `
              <tr>
                <td>${esc(x.name)}</td>
                <td>${x.qty}</td>
                <td>${money(x.price)}</td>
                <td>${money(x.total)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="report-total">
        الإجمالي النهائي: ${money(total)}
      </div>

      <details>
        <summary>تفاصيل الفواتير (${invoices.length})</summary>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>التاريخ</th>
                <th>السائق</th>
                <th>الأصناف والكميات</th>
                <th>الإجمالي</th>
              </tr>
            </thead>

            <tbody>
              ${invoices.map(i => `
                <tr>
                  <td>${esc(i.number || String(i.id).slice(-6))}</td>

                  <td>${esc(i.date)}</td>

                  <td>${esc(driverLabel(i.driverId))}</td>

                  <td>
                    ${(i.items || []).map(x =>
                      `${esc(x.name)}: ${Number(x.qty || 0)}`
                    ).join("، ")}
                  </td>

                  <td>${money(invoiceTotal(i))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </details>

    </div>
  `;
}


/* عرض التقرير */

function renderReport() {
  const type = $("reportType").value;

  if (type === "driver" && !$("reportDriver").value) {
    $("reportOutput").innerHTML =
      '<div class="empty">اختر السائق لعرض كشف حسابه.</div>';

    return [];
  }

  const invoices = filteredReportInvoices();

  if (!invoices.length) {
    $("reportOutput").innerHTML =
      '<div class="empty">لا توجد فواتير فعالة ضمن الفترة المحددة.</div>';

    return [];
  }

  if (type === "all") {
    /*
     * جميع السائقين:
     * بطاقة واحدة فقط تشمل فواتيرهم وأصنافهم مجتمعة.
     */
    $("reportOutput").innerHTML =
      reportCard("جميع السائقين", invoices, true);

  } else {
    /*
     * سائق محدد:
     * فواتير السائق المختار فقط.
     */
    $("reportOutput").innerHTML =
      reportCard(
        driverLabel($("reportDriver").value),
        invoices,
        false
      );
  }

  return invoices;
}


/* =================================================
   طباعة التقرير الحراري 80 مم

   يطبع تقريرًا واحدًا لجميع السائقين عند اختيار الكل،
   أو تقرير السائق المحدد فقط.
================================================= */

$("printReportBtn").onclick = () => {
  const invoices = renderReport();

  if (!invoices || !invoices.length) return;

  const isAll = $("reportType").value === "all";

  const title = isAll
    ? "جميع السائقين"
    : driverLabel($("reportDriver").value);

  const items = aggregate(invoices);

  const total = invoices.reduce(
    (s, inv) => s + invoiceTotal(inv),
    0
  );

  const qty = items.reduce(
    (s, x) => s + x.qty,
    0
  );

  const driverCount = new Set(
    invoices.map(i => i.driverId)
  ).size;

  $("printArea").innerHTML = `
    <div class="receipt">

      <h2>مطاعم ومطابخ سحايب ديرتي</h2>

      <h3>
        ${isAll
          ? "التقرير الموحد لجميع السائقين"
          : "كشف حساب صرف الأصناف"}
      </h3>

      <div class="center">
        ${isAll ? "جميع السائقين" : `السائق: ${esc(title)}`}
      </div>

      <div class="center">
        ${reportDateText()}
      </div>

      <div class="rule"></div>

      <div>عدد الفواتير: ${invoices.length}</div>

      ${isAll
        ? `<div>عدد السائقين: ${driverCount}</div>`
        : ""}

      <table>
        <thead>
          <tr>
            <th>الصنف</th>
            <th>كمية</th>
            <th>متوسط السعر</th>
            <th>الإجمالي</th>
          </tr>
        </thead>

        <tbody>
          ${items.map(x => `
            <tr>
              <td>${esc(x.name)}</td>
              <td>${x.qty}</td>
              <td>${Number(x.price).toFixed(2)}</td>
              <td>${Number(x.total).toFixed(2)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="rule"></div>

      <div>مجموع الكميات: ${qty}</div>

      <div class="grand">
        الإجمالي النهائي: ${total.toFixed(2)} ريال
      </div>

      <div class="smallprint">
        تم استخراج الكشف من فواتير الصرف الفعالة المحفوظة.
      </div>

    </div>
  `;

  window.print();
};


/* =========================
   طباعة فاتورة منفردة
========================= */

window.printSingle = id => {
  const inv = db.invoices.find(x => x.id === id);

  if (!inv) return;

  const rows = (inv.items || []).map(x => `
    <tr>
      <td>${esc(x.name)}</td>
      <td>${Number(x.qty || 0)}</td>
      <td>${Number(x.price || 0).toFixed(2)}</td>
      <td>${(
        Number(x.qty || 0) * Number(x.price || 0)
      ).toFixed(2)}</td>
    </tr>
  `).join("");

  $("printArea").innerHTML = `
<div class="receipt">

  <div class="receipt-logo">
    <img src="./logo.png" alt="شعار مطاعم سحايب ديرتي">
  </div>

  <h2>مطاعم ومطابخ سحايب ديرتي</h2>

      <h3>فاتورة صرف أصناف</h3>

      <div class="center">
        رقم الفاتورة:
        ${esc(inv.number || String(inv.id).slice(-6))}
      </div>

      <div>السائق: ${esc(driverLabel(inv.driverId))}</div>

      <div>التاريخ: ${esc(inv.date)}</div>

      ${inv.notes
        ? `<div>ملاحظات: ${esc(inv.notes)}</div>`
        : ""}

      <div class="rule"></div>

      <table>
        <thead>
          <tr>
            <th>الصنف</th>
            <th>كمية</th>
            <th>سعر</th>
            <th>الإجمالي</th>
          </tr>
        </thead>

        <tbody>${rows}</tbody>
      </table>

      <div class="rule"></div>

      <div>مجموع الكميات: ${sumQty(inv.items)}</div>

      <div class="grand">
        الإجمالي: ${invoiceTotal(inv).toFixed(2)} ريال
      </div>

      <div class="smallprint"> ديرتي</div>
<div style="border:1px solid #000;padding:8px;margin-top:12px;text-align:right;font-size:12px;line-height:2;page-break-inside:avoid;">

  <div style="text-align:center;font-weight:bold;border-bottom:1px dashed #000;padding-bottom:5px;margin-bottom:5px;">
    ملاحظات مدير الصالة
  </div>

  <div>الملاحظة: ............................</div>

  <div style="font-weight:bold;margin-top:5px;">
    في حال الكنسلة:
  </div>

  <div>اسم المكنسل: ........................</div>

  <div>سبب الكنسلة: .........................</div>

  <div style="margin-top:8px;">
    توقيع مدير الصالة:
  </div>

  <div style="height:35px;border-bottom:1px solid #000;"></div>

</div>
    </div>
  `;

  window.print();
};


/* =========================
   عرض الأرشيف
========================= */

function renderArchive() {
  const q = ($("archiveSearch").value || "")
    .trim()
    .toLowerCase();

  const date = $("archiveDate").value;

  const list = db.invoices
    .filter(i =>
      (i.archived || i.date !== today()) &&
      (!q || driverLabel(i.driverId).toLowerCase().includes(q)) &&
      (!date || i.date === date)
    )
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      (b.createdAt || 0) - (a.createdAt || 0)
    );

  $("archiveTable").innerHTML = list.length
    ? tableInvoices(list)
    : '<div class="empty">لا توجد فواتير في الأرشيف المطابق للبحث.</div>';
}

$("archiveSearch").oninput = renderArchive;
$("archiveDate").onchange = renderArchive;


/* =========================
   إنهاء يوم العمل
========================= */

$("resetDayBtn").onclick = () => {
  const current = activeInvoices().filter(isToday);

  if (!current.length) {
    return toast("لا توجد فواتير لليوم لنقلها إلى الأرشيف.");
  }

  if (!confirm(
    `سيتم إنهاء يوم العمل وأرشفة ${current.length} فاتورة. لن تُحذف الفواتير. هل تريد المتابعة؟`
  )) {
    return;
  }

  current.forEach(i => {
    i.archived = true;
  });

  db.dayStarted = today();

  saveDB();

  toast("تم إنهاء يوم العمل وحفظ الفواتير في الأرشيف");
};


/* =========================
   حذف الأرشيف القديم
========================= */

$("clearArchiveBtn").onclick = () => {
  const archive = db.invoices.filter(
    i => i.archived || i.date !== today()
  );

  if (!archive.length) {
    return toast("الأرشيف فارغ.");
  }

  if (!confirm(
    `تنبيه: سيتم حذف ${archive.length} فاتورة من الأرشيف نهائيًا من هذا الجهاز. خذ نسخة احتياطية أولًا. هل تريد الحذف؟`
  )) {
    return;
  }

  db.invoices = db.invoices.filter(
    i => !(i.archived || i.date !== today())
  );

  saveDB();

  toast("تم حذف فواتير الأرشيف المحددة");
};


/* =========================
   تنزيل نسخة احتياطية
========================= */

$("backupBtn").onclick = () => {
  const blob = new Blob(
    [JSON.stringify({
      ...db,
      backupCreatedAt: new Date().toISOString()
    }, null, 2)],
    { type: "application/json" }
  );

  const a = document.createElement("a");

  a.href = URL.createObjectURL(blob);

  a.download = `deerty-backup-${today()}.json`;

  a.click();

  URL.revokeObjectURL(a.href);

  toast("تم تجهيز النسخة الاحتياطية");
};


/* =========================
   استعادة نسخة احتياطية
========================= */

$("restoreInput").onchange = async e => {
  const file = e.target.files[0];

  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());

    if (
      !Array.isArray(parsed.drivers) ||
      !Array.isArray(parsed.items) ||
      !Array.isArray(parsed.invoices)
    ) {
      throw new Error("invalid");
    }

    if (!confirm(
      "ستُستبدل البيانات الموجودة في هذا الجهاز بالنسخة الاحتياطية. يُفضّل تنزيل نسخة من البيانات الحالية أولًا. هل تريد المتابعة؟"
    )) {
      return;
    }

    db = {
      drivers: parsed.drivers,
      items: parsed.items,
      invoices: parsed.invoices,
      dayStarted: parsed.dayStarted || today()
    };

    saveDB();

    toast("تمت استعادة النسخة الاحتياطية");

  } catch (err) {
    toast(
      "تعذر قراءة النسخة الاحتياطية. تأكد من اختيار ملف النظام الصحيح."
    );

  } finally {
    e.target.value = "";
  }
};


/* =========================
   بدء تشغيل النظام
========================= */

if (!$("invoiceDate").value) {
  $("invoiceDate").value = today();
}

renderAll();

})();
