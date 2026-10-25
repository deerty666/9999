(() => {
"use strict";

const KEY = "deerty_driver_accounts_v2";

const $ = id => document.getElementById(id);

const today = () => {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const money = n =>
  `${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ر.س`;

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

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


/* تحميل البيانات */

function loadDB() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY));

    if (
      x &&
      Array.isArray(x.drivers) &&
      Array.isArray(x.items) &&
      Array.isArray(x.invoices)
    ) {
      return x;
    }
  } catch (e) {}

  return {
    drivers: [],
    items: [],
    invoices: [],
    dayStarted: today()
  };
}


/* حفظ البيانات */

function saveDB() {
  localStorage.setItem(KEY, JSON.stringify(db));
  renderAll();
}


/* رسالة التنبيه */

function toast(msg) {
  const t = $("toast");

  t.textContent = msg;
  t.classList.add("show");

  setTimeout(() => {
    t.classList.remove("show");
  }, 2600);
}


/* معلومات السائق */

function driverLabel(id) {
  return db.drivers.find(x => x.id === id)?.name || "سائق محذوف/غير معروف";
}


/* الفواتير الفعالة */

function activeInvoices() {
  return db.invoices.filter(x => !x.cancelled);
}


/* تحديد فواتير اليوم */

function isToday(inv) {
  return inv.date === today() && !inv.archived;
}


/* مجموع الكميات */

function sumQty(lines) {
  return (lines || []).reduce(
    (s, x) => s + Number(x.qty || 0),
    0
  );
}


/* إجمالي الفاتورة */

function invoiceTotal(inv) {
  return (inv.items || []).reduce(
    (s, x) => s + Number(x.qty || 0) * Number(x.price || 0),
    0
  );
}


/* التنقل بين الصفحات */

function nav(page) {
  document.querySelectorAll(".page").forEach(x => {
    x.classList.toggle("active", x.id === `page-${page}`);
  });

  document.querySelectorAll(".tab").forEach(x => {
    x.classList.toggle("active", x.dataset.page === page);
  });

  if (page === "newInvoice") renderItemPicker();
  if (page === "reports") fillReportDrivers();
  if (page === "archive") renderArchive();
}

document.querySelectorAll(".tab").forEach(b => {
  b.addEventListener("click", () => nav(b.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(b => {
  b.addEventListener("click", () => nav(b.dataset.go));
});


/* تحديث الواجهة */

function renderAll() {
  renderStats();
  renderDrivers();
  renderItems();
  renderToday();
  renderItemPicker();
  fillDriverSelects();
  renderArchive();
}


/* إحصائيات اليوم */

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


/* فواتير اليوم */

function renderToday() {
  const list = activeInvoices()
    .filter(isToday)
    .sort((a, b) => b.createdAt - a.createdAt);

  $("todayInvoices").innerHTML = list.length
    ? tableInvoices(list, false)
    : '<div class="empty">لا توجد فواتير صرف محفوظة لليوم.</div>';
}


/* جدول الفواتير */

function tableInvoices(list, showArchived = true) {
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
            <td>${esc(inv.number || inv.id.slice(-6))}</td>
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
                onclick="editInvoice('${inv.id}')">
                تعديل
              </button>

              <button class="btn small secondary"
                onclick="printSingle('${inv.id}')">
                طباعة
              </button>

              <button class="btn small danger"
                onclick="cancelInvoice('${inv.id}')">
                إلغاء
              </button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}


/* قوائم اختيار السائق */

function fillDriverSelects() {
  const active = db.drivers.filter(d => !d.inactive);

  for (const id of ["invoiceDriver", "reportDriver"]) {
    const el = $(id);
    const old = el.value;

    el.innerHTML =
      '<option value="">اختر السائق</option>' +
      active.map(d => `
        <option value="${d.id}">${esc(d.name)}</option>
      `).join("");

    if (active.some(d => d.id === old)) {
      el.value = old;
    }
  }
}


/* جدول السائقين */

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


/* جدول الأصناف */

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


/* بطاقات اختيار الأصناف */

function renderItemPicker() {
  const available = db.items.filter(i => !i.inactive);

  $("itemPicker").innerHTML = available.length
    ? available.map(i => `
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


/* إضافة صنف للفاتورة */

function addDraftItem(id) {
  const item = db.items.find(x => x.id === id);

  if (!item) return;

  const existing = draft.find(x => x.itemId === id);

  if (existing) {
    toast("الصنف موجود؛ عدّل الكمية في الجدول.");
    return;
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


/* عرض أصناف الفاتورة */

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


/* تغيير الكمية */

window.changeQty = (i, v) => {
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


/* حذف صنف من المسودة */

window.removeDraft = i => {
  draft.splice(i, 1);
  renderDraft();
};


/* تفريغ نموذج الفاتورة */

$("clearInvoiceBtn").onclick = () => clearInvoiceForm();

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

$("cancelEditBtn").onclick = clearInvoiceForm;


/* حفظ الفاتورة */

/* حفظ الفاتورة ثم طباعتها تلقائيًا */

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
    number: old?.number || `DF-${Date.now().toString().slice(-8)}`,
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

  // حفظ الفاتورة في قاعدة البيانات
  saveDB();

  // طباعة الفاتورة المحفوظة مباشرة
  window.printSingle(inv.id);

  // تفريغ النموذج بعد الحفظ
  clearInvoiceForm();

  toast(old ? "تم تحديث الفاتورة وإرسالها للطباعة" : "تم حفظ الفاتورة وإرسالها للطباعة");

  nav("dashboard");
};

/* تعديل الفاتورة */

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
  $("invoiceFormTitle").textContent = "تعديل فاتورة " + inv.number;
  $("saveInvoiceBtn").textContent = "حفظ التعديلات";

  $("cancelEditBtn").classList.remove("hidden");

  $("invoiceDriver").value = inv.driverId;
  $("invoiceDate").value = inv.date;
  $("invoiceNotes").value = inv.notes || "";

  draft = inv.items.map(x => ({
    ...x,
    qty: String(x.qty)
  }));

  inv.cancelled = false;

  renderDraft();
};


/* إلغاء الفاتورة */

window.cancelInvoice = id => {
  const inv = db.invoices.find(x => x.id === id);

  if (!inv) return;

  if (!confirm(`هل تريد إلغاء الفاتورة ${inv.number}؟ ستبقى في الأرشيف ولن تدخل في الإجماليات.`)) {
    return;
  }

  inv.cancelled = true;

  saveDB();

  toast("تم إلغاء الفاتورة مع الاحتفاظ بها");
};


/* إضافة أو تعديل سائق */

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

  db.drivers.sort((a, b) => a.name.localeCompare(b.name, "ar"));

  saveDB();

  $("driverForm").reset();
  $("driverId").value = "";
  $("driverSaveBtn").textContent = "إضافة سائق";
  $("driverCancelBtn").classList.add("hidden");

  toast("تم حفظ بيانات السائق");
};


/* إلغاء تعديل السائق */

$("driverCancelBtn").onclick = () => {
  $("driverForm").reset();
  $("driverId").value = "";
  $("driverSaveBtn").textContent = "إضافة سائق";
  $("driverCancelBtn").classList.add("hidden");
};


/* تحميل بيانات السائق للتعديل */

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


/* إيقاف أو تفعيل السائق */

window.toggleDriver = id => {
  const d = db.drivers.find(x => x.id === id);

  if (!d) return;

  d.inactive = !d.inactive;

  saveDB();
};


/* إضافة أو تعديل صنف */

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

  db.items.sort((a, b) => a.name.localeCompare(b.name, "ar"));

  saveDB();

  $("itemForm").reset();
  $("itemId").value = "";
  $("itemSaveBtn").textContent = "إضافة صنف";
  $("itemCancelBtn").classList.add("hidden");

  toast("تم حفظ الصنف والسعر");
};


/* إلغاء تعديل الصنف */

$("itemCancelBtn").onclick = () => {
  $("itemForm").reset();
  $("itemId").value = "";
  $("itemSaveBtn").textContent = "إضافة صنف";
  $("itemCancelBtn").classList.add("hidden");
};


/* تحميل بيانات الصنف للتعديل */

window.editItem = id => {
  const it = db.items.find(x => x.id === id);

  if (!it) return;

  $("itemId").value = id;
  $("itemName").value = it.name;
  $("itemPrice").value = it.price;

  $("itemSaveBtn").textContent = "حفظ التعديل";
  $("itemCancelBtn").classList.remove("hidden");
};


/* إيقاف أو تفعيل الصنف */

window.toggleItem = id => {
  const it = db.items.find(x => x.id === id);

  if (!it) return;

  it.inactive = !it.inactive;

  saveDB();
};


/* تقارير السائقين */

function fillReportDrivers() {
  fillDriverSelects();

  $("reportDriverWrap").classList.toggle(
    "hidden",
    $("reportType").value === "all"
  );
}

$("reportType").onchange = fillReportDrivers;

$("reportFrom").value = today();
$("reportTo").value = today();


/* اختيار الفواتير للفترة */

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
      a.createdAt - b.createdAt
    );
}

$("showReportBtn").onclick = renderReport;


/* عرض التقرير */

function renderReport() {
  const type = $("reportType").value;

  if (type === "driver" && !$("reportDriver").value) {
    return toast("اختر السائق.");
  }

  const invoices = filteredReportInvoices();

  const ids = type === "all"
    ? [...new Set(invoices.map(x => x.driverId))]
    : [$("reportDriver").value];

  const groups = ids
    .map(id => ({
      id,
      name: driverLabel(id),
      invoices: invoices.filter(x => x.driverId === id)
    }))
    .filter(g => g.invoices.length);

  const out = groups
    .map(g => reportCard(g.name, g.invoices))
    .join("");

  $("reportOutput").innerHTML = out ||
    '<div class="empty">لا توجد فواتير فعالة ضمن الفترة المحددة.</div>';

  return groups;
}


/* جمع كميات وقيم الصنف */

function aggregate(invoices) {
  const map = new Map();

  for (const inv of invoices) {
    for (const x of inv.items) {
      const key = x.itemId || x.name;

      const old = map.get(key) || {
        name: x.name,
        qty: 0,
        price: Number(x.price),
        total: 0
      };

      old.qty += Number(x.qty);
      old.total += Number(x.qty) * Number(x.price);
      old.price = Number(x.price);

      map.set(key, old);
    }
  }

  return [...map.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "ar")
  );
}


/* بطاقة كشف الحساب */

function reportCard(name, invoices) {
  const items = aggregate(invoices);

  const total = items.reduce((s, x) => s + x.total, 0);
  const qty = items.reduce((s, x) => s + x.qty, 0);

  return `
    <div class="report-card">

      <div class="report-heading">
        <h2>مطاعم ومطابخ سحايب ديرتي</h2>
        <h3>كشف حساب صرف الأصناف</h3>

        <b>السائق: ${esc(name)}</b>

        <p>
          من ${esc($("reportFrom").value || "البداية")}
          إلى ${esc($("reportTo").value || "اليوم")}
        </p>
      </div>

      <div class="report-summary">
        <span>عدد الفواتير: ${invoices.length}</span>
        <span>مجموع الكميات: ${qty}</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الصنف</th>
              <th>مجموع الكمية</th>
              <th>سعر الوحدة</th>
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
        <summary>تفاصيل الفواتير المجمعة (${invoices.length})</summary>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>التاريخ</th>
                <th>الأصناف والكميات</th>
                <th>الإجمالي</th>
              </tr>
            </thead>

            <tbody>
              ${invoices.map(i => `
                <tr>
                  <td>${esc(i.number)}</td>
                  <td>${esc(i.date)}</td>

                  <td>
                    ${i.items.map(x =>
                      `${esc(x.name)}: ${x.qty}`
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


/* طباعة كشف الحساب على طابعة 80 مم */

$("printReportBtn").onclick = () => {
  const groups = renderReport();

  if (!groups?.length) return;

  const cards = groups.map(g => {
    const items = aggregate(g.invoices);

    const total = items.reduce((s, x) => s + x.total, 0);

    return `
      <div class="receipt">

        <h2>سحايب ديرتي</h2>
        <h3>كشف حساب صرف الأصناف</h3>

        <div class="center">السائق: ${esc(g.name)}</div>

        <div class="center">
          من ${esc($("reportFrom").value || "البداية")}
          إلى ${esc($("reportTo").value || "اليوم")}
        </div>

        <div class="rule"></div>

        <div>عدد الفواتير: ${g.invoices.length}</div>

        <table>
          <thead>
            <tr>
              <th>الصنف</th>
              <th>كمية</th>
              <th>سعر</th>
              <th>الإجمالي</th>
            </tr>
          </thead>

          <tbody>
            ${items.map(x => `
              <tr>
                <td>${esc(x.name)}</td>
                <td>${x.qty}</td>
                <td>${Number(x.price).toFixed(2)}</td>
                <td>${x.total.toFixed(2)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div class="rule"></div>

        <div>
          مجموع الكميات:
          ${items.reduce((s, x) => s + x.qty, 0)}
        </div>

        <div class="grand">
          الإجمالي: ${total.toFixed(2)} ريال
        </div>

        <div class="smallprint">
          تم استخراج الكشف من فواتير الصرف المحفوظة
        </div>

      </div>

      <div style="page-break-after:always"></div>
    `;
  }).join("");

  $("printArea").innerHTML = cards;

  window.print();
};


/* طباعة فاتورة صرف منفردة */

window.printSingle = id => {
  const inv = db.invoices.find(x => x.id === id);

  if (!inv) return;

  const rows = inv.items.map(x => `
    <tr>
      <td>${esc(x.name)}</td>
      <td>${x.qty}</td>
      <td>${Number(x.price).toFixed(2)}</td>
      <td>${(x.qty * x.price).toFixed(2)}</td>
    </tr>
  `).join("");

  $("printArea").innerHTML = `
    <div class="receipt">

      <h2>مطاعم ومطابخ سحايب ديرتي</h2>
      <h3>فاتورة صرف أصناف</h3>

      <div class="center">
        رقم الفاتورة: ${esc(inv.number)}
      </div>

      <div>السائق: ${esc(driverLabel(inv.driverId))}</div>
      <div>التاريخ: ${esc(inv.date)}</div>

      ${inv.notes ? `<div>ملاحظات: ${esc(inv.notes)}</div>` : ""}

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

      <div class="smallprint">شكرًا لكم</div>

    </div>
  `;

  window.print();
};


/* عرض الأرشيف */

function renderArchive() {
  const q = ($("archiveSearch").value || "").trim().toLowerCase();
  const date = $("archiveDate").value;

  const list = db.invoices
    .filter(i =>
      (i.archived || i.date !== today()) &&
      (!q || driverLabel(i.driverId).toLowerCase().includes(q)) &&
      (!date || i.date === date)
    )
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt - a.createdAt
    );

  $("archiveTable").innerHTML = list.length
    ? tableInvoices(list)
    : '<div class="empty">لا توجد فواتير في الأرشيف المطابق للبحث.</div>';
}

$("archiveSearch").oninput = renderArchive;
$("archiveDate").onchange = renderArchive;


/* إنهاء يوم العمل وأرشفة الفواتير */

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


/* حذف الأرشيف القديم */

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


/* تنزيل نسخة احتياطية */

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


/* استعادة نسخة احتياطية */

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
    toast("تعذر قراءة النسخة الاحتياطية. تأكد من اختيار ملف النظام الصحيح.");

  } finally {
    e.target.value = "";
  }
};


/* بدء التشغيل */

if (!$("invoiceDate").value) {
  $("invoiceDate").value = today();
}

renderAll();

})();
