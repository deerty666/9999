"use strict";

const $ = id => document.getElementById(id);

const STORAGE_KEY = "deerty_delivery_accounts_v1";

let drivers = [];
let debts = [];
let cashRows = [];
let nextId = 1;

const defaultDrivers = () =>
  Array.from({ length: 10 }, (_, i) => ({
    id: nextId++,
    name: `سائق ${i + 1}`,
    addition: 0,
    account: 0,
    network: 0,
    petrol: 0,
    workRate: 0,
    expenses: 0
  }));

const defaultCashRows = () => [
  { id: nextId++, name: "الشبكة", amount: 0, note: "" },
  { id: nextId++, name: "الكاش", amount: 0, note: "" },
  { id: nextId++, name: "هنقرستيشن", amount: 0, note: "" },
  { id: nextId++, name: "المصروفات", amount: 0, note: "" },
  { id: nextId++, name: "الديون", amount: 0, note: "" }
];

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function today() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);
}

function loadAll() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (saved && Array.isArray(saved.drivers)) {
      drivers = saved.drivers;
      debts = Array.isArray(saved.debts) ? saved.debts : [];
      cashRows = Array.isArray(saved.cashRows) ? saved.cashRows : defaultCashRows();

      const allIds = [
        ...drivers.map(x => Number(x.id) || 0),
        ...debts.map(x => Number(x.id) || 0),
        ...cashRows.map(x => Number(x.id) || 0)
      ];

      nextId = Math.max(1, ...allIds) + 1;
    } else {
      drivers = defaultDrivers();
      debts = [];
      cashRows = defaultCashRows();
    }
  } catch (error) {
    drivers = defaultDrivers();
    debts = [];
    cashRows = defaultCashRows();
  }
}

function saveAll(showMessage = true) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      drivers,
      debts,
      cashRows,
      savedAt: new Date().toISOString()
    }));

    if (showMessage && $("saveStatus")) {
      $("saveStatus").textContent = "تم الحفظ بنجاح ✓";
    }
  } catch (error) {
    alert("تعذر حفظ البيانات. تأكد من مساحة التخزين في المتصفح.");
  }
}

function getRemaining(driver) {
  return numberValue(driver.account)
    - numberValue(driver.network)
    - numberValue(driver.petrol)
    - numberValue(driver.workRate)
    - numberValue(driver.expenses);
}

function renderDrivers() {
  const body = $("driversBody");
  body.innerHTML = "";

  drivers.forEach(driver => {
    const remaining = getRemaining(driver);

    const row = document.createElement("tr");

    row.innerHTML = `
      <td data-label="السائق">
        <input class="name" aria-label="اسم السائق"
          value="${escapeHTML(driver.name)}"
          data-id="${driver.id}" data-field="name">
      </td>

      <td data-label="إضافة">
        <input type="number" step="0.01" aria-label="إضافة"
          value="${numberValue(driver.addition)}"
          data-id="${driver.id}" data-field="addition">
      </td>

      <td data-label="الحساب">
        <input type="number" step="0.01" aria-label="الحساب"
          value="${numberValue(driver.account)}"
          data-id="${driver.id}" data-field="account">
      </td>

      <td data-label="الشبكة">
        <input type="number" step="0.01" aria-label="الشبكة"
          value="${numberValue(driver.network)}"
          data-id="${driver.id}" data-field="network">
      </td>

      <td data-label="البنزين">
        <input type="number" step="0.01" aria-label="البنزين"
          value="${numberValue(driver.petrol)}"
          data-id="${driver.id}" data-field="petrol">
      </td>

      <td data-label="نسبة الشغل">
        <input type="number" step="0.01" aria-label="نسبة الشغل"
          value="${numberValue(driver.workRate)}"
          data-id="${driver.id}" data-field="workRate">
      </td>

      <td data-label="المصروف">
        <input type="number" step="0.01" aria-label="المصروف"
          value="${numberValue(driver.expenses)}"
          data-id="${driver.id}" data-field="expenses">
      </td>

      <td data-label="المتبقي">
        <span class="remaining">${money(remaining)}</span>
      </td>

      <td data-label="الحالة">
        <span class="status">${remaining < 0 ? "له مستحقات" : remaining > 0 ? "عليه" : "مسدد"}</span>
      </td>

      <td class="no-print">
        <button type="button" data-delete-driver="${driver.id}">حذف</button>
      </td>
    `;

    body.appendChild(row);
  });

  updateDriverTotals();
}

function updateDriverTotals() {
  const fields = [
    "addition", "account", "network", "petrol",
    "workRate", "expenses"
  ];

  const totals = {};

  fields.forEach(field => {
    totals[field] = drivers.reduce(
      (sum, d) => sum + numberValue(d[field]), 0
    );
  });

  const remaining = drivers.reduce(
    (sum, d) => sum + getRemaining(d), 0
  );

  $("driverTotals").innerHTML = `
    <th>الإجمالي</th>
    <td>${money(totals.addition)}</td>
    <td>${money(totals.account)}</td>
    <td>${money(totals.network)}</td>
    <td>${money(totals.petrol)}</td>
    <td>${money(totals.workRate)}</td>
    <td>${money(totals.expenses)}</td>
    <td>${money(remaining)}</td>
    <td>${remaining < 0 ? "له مستحقات" : remaining > 0 ? "عليه" : "مسدد"}</td>
    <td class="no-print"></td>
  `;
}

function renderDebts() {
  const body = $("debtsBody");
  body.innerHTML = "";

  debts.forEach(debt => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <input class="name" aria-label="اسم السائق"
          value="${escapeHTML(debt.name)}"
          data-id="${debt.id}" data-debt-field="name">
      </td>

      <td>
        <input class="note" aria-label="البيان"
          value="${escapeHTML(debt.note)}"
          data-id="${debt.id}" data-debt-field="note">
      </td>

      <td>
        <input type="number" step="0.01" aria-label="قيمة الدين"
          value="${numberValue(debt.amount)}"
          data-id="${debt.id}" data-debt-field="amount">
      </td>

      <td class="no-print">
        <button type="button" data-delete-debt="${debt.id}">حذف</button>
      </td>
    `;

    body.appendChild(row);
  });

  $("debtsTotal").textContent = money(
    debts.reduce((sum, d) => sum + numberValue(d.amount), 0)
  );
}

function renderCash() {
  const body = $("cashBody");
  body.innerHTML = "";

  cashRows.forEach(item => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <input class="name" aria-label="اسم البند"
          value="${escapeHTML(item.name)}"
          data-id="${item.id}" data-cash-field="name">
      </td>

      <td>
        <input type="number" step="0.01" aria-label="المبلغ"
          value="${numberValue(item.amount)}"
          data-id="${item.id}" data-cash-field="amount">
      </td>

      <td>
        <input class="note" aria-label="ملاحظات"
          value="${escapeHTML(item.note)}"
          data-id="${item.id}" data-cash-field="note">
      </td>

      <td class="no-print">
        <button type="button" data-delete-cash="${item.id}">حذف</button>
      </td>
    `;

    body.appendChild(row);
  });

  $("cashTotal").textContent = money(
    cashRows.reduce((sum, item) => sum + numberValue(item.amount), 0)
  );
}

function renderAll() {
  renderDrivers();
  renderDebts();
  renderCash();
  updatePrintDates();
}

function updatePrintDates() {
  const date = $("workDate").value || today();

  ["printDate1", "printDate2", "printDate3"].forEach(id => {
    $(id).textContent = `التاريخ: ${date}`;
  });
}

function printSection(id) {
  updatePrintDates();

  const target = $(id);

  if (!target) return;

  document.body.classList.add("printing");
  target.classList.add("printing-target");

  window.print();

  setTimeout(() => {
    document.body.classList.remove("printing");
    target.classList.remove("printing-target");
  }, 500);
}

$("driversBody").addEventListener("change", event => {
  const input = event.target;
  const id = Number(input.dataset.id);
  const field = input.dataset.field;

  if (!field) return;

  const driver = drivers.find(d => d.id === id);
  if (!driver) return;

  driver[field] = field === "name"
    ? input.value
    : numberValue(input.value);

  renderAll();
  saveAll();
});

$("driversBody").addEventListener("input", event => {
  const input = event.target;
  const id = Number(input.dataset.id);
  const field = input.dataset.field;

  if (!field || field === "name") return;

  const driver = drivers.find(d => d.id === id);
  if (!driver) return;

  driver[field] = numberValue(input.value);
  updateDriverTotals();

  const row = input.closest("tr");
  const remaining = getRemaining(driver);

  row.querySelector(".remaining").textContent = money(remaining);
  row.querySelector(".status").textContent =
    remaining < 0 ? "له مستحقات" : remaining > 0 ? "عليه" : "مسدد";

  saveAll(false);
});

$("driversBody").addEventListener("click", event => {
  const button = event.target.closest("[data-delete-driver]");
  if (!button) return;

  if (!confirm("هل تريد حذف هذا السائق؟")) return;

  drivers = drivers.filter(d => d.id !== Number(button.dataset.deleteDriver));

  renderAll();
  saveAll();
});

$("addDriver").addEventListener("click", () => {
  const name = prompt("اكتب اسم السائق الجديد:");
  if (!name || !name.trim()) return;

  drivers.push({
    id: nextId++,
    name: name.trim(),
    addition: 0,
    account: 0,
    network: 0,
    petrol: 0,
    workRate: 0,
    expenses: 0
  });

  renderAll();
  saveAll();
});

$("debtsBody").addEventListener("input", event => {
  const input = event.target;
  const field = input.dataset.debtField;
  if (!field) return;

  const debt = debts.find(d => d.id === Number(input.dataset.id));
  if (!debt) return;

  debt[field] = field === "amount"
    ? numberValue(input.value)
    : input.value;

  $("debtsTotal").textContent = money(
    debts.reduce((sum, d) => sum + numberValue(d.amount), 0)
  );

  saveAll(false);
});

$("debtsBody").addEventListener("click", event => {
  const button = event.target.closest("[data-delete-debt]");
  if (!button) return;

  debts = debts.filter(d => d.id !== Number(button.dataset.deleteDebt));

  renderDebts();
  saveAll();
});

$("addDebt").addEventListener("click", () => {
  const name = prompt("اسم السائق صاحب الدين:");
  if (!name || !name.trim()) return;

  const amount = numberValue(prompt("قيمة الدين بالريال:", "0"));
  const note = prompt("بيان الدين (اختياري):", "") || "";

  debts.push({
    id: nextId++,
    name: name.trim(),
    amount,
    note
  });

  renderDebts();
  saveAll();
});

$("cashBody").addEventListener("input", event => {
  const input = event.target;
  const field = input.dataset.cashField;
  if (!field) return;

  const item = cashRows.find(x => x.id === Number(input.dataset.id));
  if (!item) return;

  item[field] = field === "amount"
    ? numberValue(input.value)
    : input.value;

  $("cashTotal").textContent = money(
    cashRows.reduce((sum, x) => sum + numberValue(x.amount), 0)
  );

  saveAll(false);
});

$("cashBody").addEventListener("click", event => {
  const button = event.target.closest("[data-delete-cash]");
  if (!button) return;

  cashRows = cashRows.filter(x => x.id !== Number(button.dataset.deleteCash));

  renderCash();
  saveAll();
});

$("addCashRow").addEventListener("click", () => {
  const name = prompt("اسم البند الجديد:");
  if (!name || !name.trim()) return;

  cashRows.push({
    id: nextId++,
    name: name.trim(),
    amount: 0,
    note: ""
  });

  renderCash();
  saveAll();
});

$("saveAll").addEventListener("click", () => {
  saveAll();
});

$("workDate").addEventListener("change", () => {
  updatePrintDates();
  saveAll();
});

$("resetDay").addEventListener("click", () => {
  const ok = confirm(
    "هل تريد تصفير المبالغ؟ سيبقى أسماء السائقين وبنود الكاشير، لكن ستُحذف مبالغ اليوم والديون المسجلة هنا."
  );

  if (!ok) return;

  drivers = drivers.map(d => ({
    ...d,
    addition: 0,
    account: 0,
    network: 0,
    petrol: 0,
    workRate: 0,
    expenses: 0
  }));

  debts = [];

  cashRows = cashRows.map(item => ({
    ...item,
    amount: 0,
    note: ""
  }));

  $("workDate").value = today();

  renderAll();
  saveAll();
});

$("workDate").value = today();

loadAll();
renderAll();
saveAll(false);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}

window.printSection = printSection;
