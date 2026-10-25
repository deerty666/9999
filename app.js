"use strict";

/* =========================================
   نظام فواتير السائقين - سحايب ديرتي
========================================= */

const STORAGE_KEY = "deerty_driver_invoices_v1";

const $ = id => document.getElementById(id);

const money = value =>
    Number(value || 0).toLocaleString("ar-SA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const todayISO = () => {
    const d = new Date();

    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
    ].join("-");
};

const formatDate = date => {
    if (!date) return "";

    const parts = String(date).split("-");

    if (parts.length !== 3) return date;

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const formatDateTime = date => {
    if (!date) return "";

    return new Date(date).toLocaleString("ar-SA");
};

const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);

const uid = () =>
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);

function createDay() {
    return {
        id: uid(),
        date: todayISO(),
        startedAt: new Date().toISOString(),
        closedAt: null
    };
}

function createInitialState() {
    return {
        version: 1,

        drivers: [],
        items: [],

        days: [createDay()],

        currentDayId: null,

        invoices: [],
        nextInvoiceNumber: 1
    };
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (!saved) {
            const initial = createInitialState();

            initial.currentDayId = initial.days[0].id;

            return initial;
        }

        const parsed = JSON.parse(saved);

        if (
            !parsed ||
            !Array.isArray(parsed.drivers) ||
            !Array.isArray(parsed.items) ||
            !Array.isArray(parsed.days) ||
            !Array.isArray(parsed.invoices)
        ) {
            throw new Error("بيانات النظام غير صحيحة");
        }

        if (!parsed.currentDayId) {
            parsed.days.push(createDay());
            parsed.currentDayId = parsed.days.at(-1).id;
        }

        if (!parsed.days.some(day => day.id === parsed.currentDayId)) {
            parsed.days.push(createDay());
            parsed.currentDayId = parsed.days.at(-1).id;
        }

        if (!Number.isFinite(parsed.nextInvoiceNumber)) {
            parsed.nextInvoiceNumber = parsed.invoices.length + 1;
        }

        return parsed;

    } catch (error) {
        alert(
            "تعذر قراءة بيانات النظام. لن يتم حذف البيانات تلقائيًا. " +
            "إذا كانت لديك نسخة احتياطية، استخدم خيار الاستعادة."
        );

        console.error(error);

        return createInitialState();
    }
}

let state = loadState();

let editingInvoiceId = null;

let toastTimer = null;


/* =========================================
   الحفظ
========================================= */

function saveState() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(state)
        );

        return true;

    } catch (error) {
        console.error(error);

        alert(
            "تعذر حفظ البيانات. قد تكون مساحة التخزين ممتلئة. " +
            "نزّل نسخة احتياطية قبل متابعة العمل."
        );

        return false;
    }
}


/* =========================================
   بيانات مساعدة
========================================= */

function currentDay() {
    return state.days.find(
        day => day.id === state.currentDayId
    );
}

function driverById(id) {
    return state.drivers.find(
        driver => driver.id === id
    );
}

function itemById(id) {
    return state.items.find(
        item => item.id === id
    );
}

function invoicesForDay(dayId) {
    return state.invoices.filter(
        invoice => invoice.dayId === dayId
    );
}

function invoiceTotal(invoice) {
    return invoice.items.reduce(
        (total, item) =>
            total + Number(item.qty) * Number(item.price),
        0
    );
}

function cleanNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
}

function currentInvoices() {
    return invoicesForDay(state.currentDayId);
}


/* =========================================
   الرسائل
========================================= */

function toast(message) {
    const element = $("toast");

    element.textContent = message;
    element.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        element.classList.remove("show");
    }, 2800);
}


/* =========================================
   التنقل بين الصفحات
========================================= */

function showPage(pageId) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.toggle("active", page.id === pageId);
    });

    document.querySelectorAll(".nav-btn").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === pageId
        );
    });

    if (pageId === "issuePage") {
        renderProducts();
    }

    if (pageId === "invoicesPage") {
        renderInvoices();
    }

    if (pageId === "summaryPage") {
        renderSummary();
    }

    if (pageId === "archivePage") {
        renderArchiveOptions();
        renderArchive();
    }

    if (pageId === "settingsPage") {
        renderManagement();
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click", () => {
        showPage(button.dataset.page);
    });
});


/* =========================================
   عرض التاريخ
========================================= */

function renderDate() {
    const day = currentDay();

    $("todayDate").textContent = day
        ? formatDate(day.date)
        : formatDate(todayISO());

    $("summaryDay").textContent = day
        ? formatDate(day.date)
        : "";
}


/* =========================================
   القوائم المنسدلة
========================================= */

function renderDriverSelects() {
    const selects = [
        $("issueDriver"),
        $("invoiceDriverFilter"),
        $("summaryDriver")
    ];

    selects.forEach(select => {
        const oldValue = select.value;

        const allowAll = select.id === "invoiceDriverFilter";

        let html = allowAll
            ? '<option value="">جميع السائقين</option>'
            : '<option value="">اختر السائق</option>';

        state.drivers.forEach(driver => {
            html += `
                <option value="${escapeHTML(driver.id)}">
                    ${escapeHTML(driver.name)}
                </option>
            `;
        });

        select.innerHTML = html;

        if (
            oldValue &&
            state.drivers.some(driver => driver.id === oldValue)
        ) {
            select.value = oldValue;
        }
    });
}


/* =========================================
   عرض الأصناف في شاشة الصرف
========================================= */

function renderProducts() {
    const grid = $("productsGrid");

    if (!state.items.length) {
        grid.innerHTML = `
            <div class="empty-state">
                لا توجد أصناف حتى الآن.
                أضف الأصناف والأسعار من إدارة النظام.
            </div>
        `;

        $("issueTotal").textContent = "0.00 ريال";

        return;
    }

    grid.innerHTML = state.items.map(item => `
        <div class="product-card">

            <h4>${escapeHTML(item.name)}</h4>

            <span class="product-price">
                ${money(item.price)} ريال
            </span>

            <label for="qty_${escapeHTML(item.id)}">
                الكمية
            </label>

            <input
                type="number"
                id="qty_${escapeHTML(item.id)}"
                class="qty-input"
                data-item-id="${escapeHTML(item.id)}"
                min="0"
                step="any"
                inputmode="decimal"
                placeholder="اكتب الكمية"
                autocomplete="off"
            >

        </div>
    `).join("");

    grid.querySelectorAll(".qty-input").forEach(input => {
        input.addEventListener("input", updateIssueTotal);
    });

    updateIssueTotal();
}

function readIssueItems() {
    const selected = [];

    document.querySelectorAll(".qty-input").forEach(input => {
        const raw = input.value.trim();

        if (raw === "") return;

        const qty = cleanNumber(raw);

        if (qty <= 0) return;

        const item = itemById(input.dataset.itemId);

        if (!item) return;

        selected.push({
            itemId: item.id,
            name: item.name,
            price: Number(item.price),
            qty
        });
    });

    return selected;
}

function updateIssueTotal() {
    const total = readIssueItems().reduce(
        (sum, item) => sum + item.qty * item.price,
        0
    );

    $("issueTotal").textContent = `${money(total)} ريال`;
}


/* =========================================
   تسجيل عملية صرف جديدة
========================================= */

$("saveIssueBtn").addEventListener("click", () => {
    const driverId = $("issueDriver").value;

    if (!driverId) {
        alert("اختر السائق أولًا.");
        return;
    }

    const driver = driverById(driverId);

    if (!driver) {
        alert("السائق غير موجود.");
        return;
    }

    const items = readIssueItems();

    if (!items.length) {
        alert("اكتب كمية صنف واحد على الأقل.");
        return;
    }

    const day = currentDay();

    if (!day) {
        alert("لا يوجد يوم عمل مفتوح.");
        return;
    }

    const invoice = {
        id: uid(),

        number: state.nextInvoiceNumber++,

        driverId: driver.id,
        driverName: driver.name,

        dayId: day.id,
        date: day.date,

        createdAt: new Date().toISOString(),

        items,

        editedAt: null
    };

    state.invoices.push(invoice);

    if (!saveState()) return;

    document.querySelectorAll(".qty-input").forEach(input => {
        input.value = "";
    });

    updateIssueTotal();

    renderInvoices();
    renderSummary();

    toast(`تم تسجيل الفاتورة رقم ${invoice.number}`);

    // إظهار الفاتورة مباشرة للطباعة.
    printInvoice(invoice.id);

});


/* =========================================
   عرض فواتير اليوم
========================================= */

function renderInvoices() {
    const container = $("invoicesList");

    const driverFilter = $("invoiceDriverFilter").value;

    const search = $("invoiceSearch").value.trim();

    let invoices = currentInvoices();

    if (driverFilter) {
        invoices = invoices.filter(
            invoice => invoice.driverId === driverFilter
        );
    }

    if (search) {
        invoices = invoices.filter(
            invoice => String(invoice.number).includes(search)
        );
    }

    invoices.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    if (!invoices.length) {
        container.innerHTML = `
            <div class="empty-state">
                لا توجد فواتير مطابقة حتى الآن.
            </div>
        `;

        return;
    }

    container.innerHTML = invoices.map(invoice => `
        <article class="invoice-card">

            <div class="invoice-card-header">

                <div>
                    <div class="invoice-number">
                        فاتورة رقم ${invoice.number}
                    </div>

                    <div class="invoice-meta">
                        السائق: ${escapeHTML(invoice.driverName)}
                    </div>

                    <div class="invoice-meta">
                        الوقت: ${escapeHTML(formatDateTime(invoice.createdAt))}
                    </div>

                    <div class="invoice-meta">
                        عدد الأصناف: ${invoice.items.length}
                    </div>
                </div>

                <div class="invoice-total">
                    ${money(invoiceTotal(invoice))} ريال
                </div>

            </div>

            <div class="invoice-buttons">

                <button
                    class="btn btn-small btn-outline"
                    data-action="print"
                    data-id="${escapeHTML(invoice.id)}"
                >
                    طباعة
                </button>

                <button
                    class="btn btn-small btn-primary"
                    data-action="edit"
                    data-id="${escapeHTML(invoice.id)}"
                >
                    تعديل الفاتورة
                </button>

            </div>

        </article>
    `).join("");

    container.querySelectorAll("[data-action]").forEach(button => {
        button.addEventListener("click", () => {
            const id = button.dataset.id;

            if (button.dataset.action === "print") {
                printInvoice(id);
            }

            if (button.dataset.action === "edit") {
                openEditInvoice(id);
            }
        });
    });
}

$("invoiceDriverFilter").addEventListener("change", renderInvoices);

$("invoiceSearch").addEventListener("input", renderInvoices);


/* =========================================
   تعديل فاتورة
========================================= */

function openEditInvoice(invoiceId) {
    const invoice = state.invoices.find(
        item => item.id === invoiceId
    );

    if (!invoice) {
        alert("الفاتورة غير موجودة.");
        return;
    }

    editingInvoiceId = invoice.id;

    $("editInvoiceInfo").textContent =
        `فاتورة رقم ${invoice.number} — السائق: ${invoice.driverName}`;

    const existing = new Map();

    invoice.items.forEach(item => {
        existing.set(item.itemId, item);
    });

    $("editInvoiceItems").innerHTML = state.items.map(item => {
        const old = existing.get(item.id);

        const qty = old ? old.qty : "";

        const price = old ? old.price : item.price;

        return `
            <div class="edit-item-row">

                <div>
                    <strong>${escapeHTML(item.name)}</strong>
                    <div class="invoice-meta">
                        السعر الحالي: ${money(item.price)} ريال
                    </div>
                </div>

                <input
                    type="number"
                    class="edit-qty"
                    data-item-id="${escapeHTML(item.id)}"
                    min="0"
                    step="any"
                    inputmode="decimal"
                    placeholder="الكمية"
                    value="${qty === 0 ? "" : escapeHTML(qty)}"
                >

                <input
                    type="number"
                    class="edit-price"
                    data-item-id="${escapeHTML(item.id)}"
                    min="0"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="السعر"
                    value="${escapeHTML(price)}"
                    aria-label="سعر الصنف"
                >

            </div>
        `;
    }).join("");

    document.querySelectorAll(".edit-qty, .edit-price").forEach(input => {
        input.addEventListener("input", updateEditTotal);
    });

    updateEditTotal();

    $("editModal").classList.add("show");
}

function updateEditTotal() {
    let total = 0;

    document.querySelectorAll(".edit-qty").forEach(input => {
        const id = input.dataset.itemId;

        const priceInput = document.querySelector(
            `.edit-price[data-item-id="${CSS.escape(id)}"]`
        );

        const qty = cleanNumber(input.value);
        const price = cleanNumber(priceInput?.value);

        if (qty > 0) {
            total += qty * price;
        }
    });

    $("editTotal").textContent = `${money(total)} ريال`;
}

function closeEditModal() {
    editingInvoiceId = null;

    $("editModal").classList.remove("show");
}

$("closeEditBtn").addEventListener("click", closeEditModal);

$("cancelEditBtn").addEventListener("click", closeEditModal);

$("editModal").addEventListener("click", event => {
    if (event.target === $("editModal")) {
        closeEditModal();
    }
});


$("saveEditBtn").addEventListener("click", () => {
    if (!editingInvoiceId) return;

    const invoice = state.invoices.find(
        item => item.id === editingInvoiceId
    );

    if (!invoice) {
        alert("الفاتورة غير موجودة.");
        closeEditModal();
        return;
    }

    const updatedItems = [];

    document.querySelectorAll(".edit-qty").forEach(input => {
        const itemId = input.dataset.itemId;

        const qty = cleanNumber(input.value);

        const priceInput = document.querySelector(
            `.edit-price[data-item-id="${CSS.escape(itemId)}"]`
        );

        const price = cleanNumber(priceInput?.value);

        if (qty <= 0) return;

        if (price < 0) return;

        const item = itemById(itemId);

        if (!item) return;

        updatedItems.push({
            itemId: item.id,
            name: item.name,
            qty,
            price
        });
    });

    if (!updatedItems.length) {
        const confirmEmpty = confirm(
            "لم تدخل أي كميات. هل تريد حفظ الفاتورة فارغة؟"
        );

        if (!confirmEmpty) return;
    }

    invoice.items = updatedItems;

    invoice.editedAt = new Date().toISOString();

    if (!saveState()) return;

    closeEditModal();

    renderInvoices();
    renderSummary();
    renderArchive();

    toast("تم حفظ تعديلات الفاتورة.");

    printInvoice(invoice.id);
});


/* =========================================
   حساب الفاتورة اليومية الشاملة
========================================= */

function aggregateDriverInvoices(dayId, driverId) {
    const invoices = invoicesForDay(dayId).filter(
        invoice => invoice.driverId === driverId
    );

    const map = new Map();

    invoices.forEach(invoice => {
        invoice.items.forEach(item => {
            const key = item.itemId || item.name;

            if (!map.has(key)) {
                map.set(key, {
                    itemId: item.itemId,
                    name: item.name,
                    qty: 0,
                    price: Number(item.price)
                });
            }

            const entry = map.get(key);

            entry.qty += Number(item.qty);

            // استخدام سعر آخر فاتورة لهذا الصنف
            entry.price = Number(item.price);
        });
    });

    const items = Array.from(map.values());

    const total = items.reduce(
        (sum, item) => sum + item.qty * item.price,
        0
    );

    return {
        invoices,
        items,
        total
    };
}

function summaryHTML(driverId, dayId) {
    const driver = driverById(driverId);

    const day = state.days.find(
        item => item.id === dayId
    );

    if (!driver || !day) {
        return `
            <div class="empty-state">
                اختر السائق لعرض الفاتورة الشاملة.
            </div>
        `;
    }

    const result = aggregateDriverInvoices(dayId, driverId);

    if (!result.invoices.length) {
        return `
            <div class="empty-state">
                لا توجد عمليات صرف لهذا السائق في هذا اليوم.
            </div>
        `;
    }

    const rows = result.items.map(item => `
        <tr>
            <td>${escapeHTML(item.name)}</td>
            <td>${money(item.qty)}</td>
            <td>${money(item.price)}</td>
            <td>${money(item.qty * item.price)} ريال</td>
        </tr>
    `).join("");

    return `
        <div class="summary-info">

            <div>
                <strong>السائق:</strong>
                ${escapeHTML(driver.name)}
            </div>

            <div>
                <strong>التاريخ:</strong>
                ${formatDate(day.date)}
            </div>

            <div>
                <strong>عدد فواتير الصرف:</strong>
                ${result.invoices.length}
            </div>

            <div>
                <strong>إجمالي الفاتورة:</strong>
                <span class="grand-total">
                    ${money(result.total)} ريال
                </span>
            </div>

        </div>

        <div class="table-wrap">

            <table class="data-table">

                <thead>
                    <tr>
                        <th>الصنف</th>
                        <th>إجمالي الكمية</th>
                        <th>سعر الوحدة</th>
                        <th>الإجمالي</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows}
                </tbody>

                <tfoot>
                    <tr>
                        <td colspan="3">الإجمالي النهائي</td>
                        <td>${money(result.total)} ريال</td>
                    </tr>
                </tfoot>

            </table>

        </div>
    `;
}

function renderSummary() {
    const driverId = $("summaryDriver").value;

    $("summaryContent").innerHTML = summaryHTML(
        driverId,
        state.currentDayId
    );

    $("printSummaryBtn").disabled = !driverId;
}

$("summaryDriver").addEventListener("change", renderSummary);


$("printSummaryBtn").addEventListener("click", () => {
    const driverId = $("summaryDriver").value;

    if (!driverId) {
        alert("اختر السائق أولًا.");
        return;
    }

    printSummary(state.currentDayId, driverId);
});


/* =========================================
   إنشاء محتوى الفاتورة للطباعة
========================================= */

function receiptHeader(title, driverName, date, time) {
    return `
        <div class="receipt-header">

            <h2>سحايب ديرتي</h2>

            <p>مطاعم ومطابخ سحايب ديرتي</p>

        </div>

        <div class="receipt-title">
            ${escapeHTML(title)}
        </div>

        <div class="receipt-meta">
            <div>السائق: ${escapeHTML(driverName)}</div>
            <div>التاريخ: ${formatDate(date)}</div>
            ${time ? `<div>وقت الإصدار: ${escapeHTML(time)}</div>` : ""}
        </div>
    `;
}

function receiptTable(items, total) {
    if (!items.length) {
        return `
            <p>لا توجد أصناف في هذه الفاتورة.</p>
        `;
    }

    return `
        <table class="receipt-table">

            <thead>
                <tr>
                    <th>الصنف</th>
                    <th>الكمية</th>
                    <th>السعر</th>
                    <th>الإجمالي</th>
                </tr>
            </thead>

            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>${escapeHTML(item.name)}</td>
                        <td>${money(item.qty)}</td>
                        <td>${money(item.price)}</td>
                        <td>${money(item.qty * item.price)}</td>
                    </tr>
                `).join("")}
            </tbody>

        </table>

        <div class="receipt-total">
            الإجمالي النهائي: ${money(total)} ريال
        </div>

        <div class="receipt-footer">
            <p>تم تسجيل عملية الصرف</p>
            <p>شكرًا لكم</p>
        </div>
    `;
}

function printHTML(html) {
    $("printArea").innerHTML = `
        <div class="receipt">
            ${html}
        </div>
    `;

    // ننتظر تجهيز محتوى الطباعة قبل فتح نافذة الطباعة.
    setTimeout(() => {
        window.print();
    }, 100);
}

function printInvoice(invoiceId) {
    const invoice = state.invoices.find(
        item => item.id === invoiceId
    );

    if (!invoice) {
        alert("الفاتورة غير موجودة.");
        return;
    }

    const html = `
        ${receiptHeader(
            `فاتورة صرف رقم ${invoice.number}`,
            invoice.driverName,
            invoice.date,
            formatDateTime(invoice.createdAt)
        )}

        ${receiptTable(
            invoice.items,
            invoiceTotal(invoice)
        )}

        <div class="receipt-footer">
            <p>رقم الفاتورة: ${invoice.number}</p>
            ${invoice.editedAt
                ? "<p>تم تعديل الفاتورة</p>"
                : ""}
        </div>
    `;

    printHTML(html);
}

function printSummary(dayId, driverId) {
    const driver = driverById(driverId);

    const day = state.days.find(
        item => item.id === dayId
    );

    if (!driver || !day) {
        alert("تعذر العثور على السائق أو يوم العمل.");
        return;
    }

    const result = aggregateDriverInvoices(dayId, driverId);

    const html = `
        ${receiptHeader(
            "الفاتورة اليومية الشاملة",
            driver.name,
            day.date,
            ""
        )}

        <div class="receipt-meta">
            عدد فواتير الصرف: ${result.invoices.length}
        </div>

        ${receiptTable(
            result.items,
            result.total
        )}
    `;

    printHTML(html);
}


/* =========================================
   إدارة السائقين والأصناف
========================================= */

$("driverForm").addEventListener("submit", event => {
    event.preventDefault();

    const name = $("newDriverName").value.trim();

    if (!name) return;

    const duplicate = state.drivers.some(
        driver => driver.name.trim() === name
    );

    if (duplicate) {
        alert("هذا الاسم موجود بالفعل.");
        return;
    }

    state.drivers.push({
        id: uid(),
        name
    });

    if (!saveState()) return;

    $("newDriverName").value = "";

    renderAll();

    toast("تمت إضافة السائق.");
});


$("itemForm").addEventListener("submit", event => {
    event.preventDefault();

    const name = $("newItemName").value.trim();

    const priceRaw = $("newItemPrice").value.trim();

    const price = Number(priceRaw);

    if (!name) {
        alert("اكتب اسم الصنف.");
        return;
    }

    if (priceRaw === "" || !Number.isFinite(price) || price < 0) {
        alert("أدخل سعرًا صحيحًا.");
        return;
    }

    const duplicate = state.items.some(
        item => item.name.trim() === name
    );

    if (duplicate) {
        alert("هذا الصنف موجود بالفعل.");
        return;
    }

    state.items.push({
        id: uid(),
        name,
        price
    });

    if (!saveState()) return;

    $("newItemName").value = "";
    $("newItemPrice").value = "";

    renderAll();

    toast("تمت إضافة الصنف.");
});


function renderManagement() {
    $("driversManagement").innerHTML = `
        <h3>السائقون المسجلون</h3>

        <div class="management-list">
            ${
                state.drivers.length
                    ? state.drivers.map(driver => `
                        <div class="management-row">

                            <strong>${escapeHTML(driver.name)}</strong>

                            <div class="row-controls">
                                <button
                                    class="btn btn-small btn-outline"
                                    data-driver-edit="${escapeHTML(driver.id)}"
                                >
                                    تعديل الاسم
                                </button>
                            </div>

                        </div>
                    `).join("")
                    : '<div class="empty-state">لا يوجد سائقون.</div>'
            }
        </div>
    `;

    $("itemsManagement").innerHTML = `
        <h3>الأصناف والأسعار</h3>

        <div class="management-list">
            ${
                state.items.length
                    ? state.items.map(item => `
                        <div class="management-row">

                            <strong>${escapeHTML(item.name)}</strong>

                            <div class="row-controls">

                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value="${escapeHTML(item.price)}"
                                    data-item-price="${escapeHTML(item.id)}"
                                    aria-label="سعر الصنف"
                                >

                                <button
                                    class="btn btn-small btn-primary"
                                    data-item-save="${escapeHTML(item.id)}"
                                >
                                    حفظ السعر
                                </button>

                            </div>

                        </div>
                    `).join("")
                    : '<div class="empty-state">لا توجد أصناف.</div>'
            }
        </div>
    `;

    $("driversManagement")
        .querySelectorAll("[data-driver-edit]")
        .forEach(button => {
            button.addEventListener("click", () => {
                renameDriver(button.dataset.driverEdit);
            });
        });

    $("itemsManagement")
        .querySelectorAll("[data-item-save]")
        .forEach(button => {
            button.addEventListener("click", () => {
                saveItemPrice(button.dataset.itemSave);
            });
        });
}

function renameDriver(driverId) {
    const driver = driverById(driverId);

    if (!driver) return;

    const newName = prompt(
        "اكتب الاسم الجديد للسائق:",
        driver.name
    );

    if (newName === null) return;

    const name = newName.trim();

    if (!name) {
        alert("اسم السائق لا يمكن أن يكون فارغًا.");
        return;
    }

    const duplicate = state.drivers.some(
        other =>
            other.id !== driverId &&
            other.name.trim() === name
    );

    if (duplicate) {
        alert("هذا الاسم مستخدم لسائق آخر.");
        return;
    }

    const oldName = driver.name;

    driver.name = name;

    // تحديث الاسم في الفواتير القديمة أيضًا.
    state.invoices.forEach(invoice => {
        if (invoice.driverId === driverId) {
            invoice.driverName = name;
        }
    });

    if (!saveState()) {
        driver.name = oldName;
        return;
    }

    renderAll();

    toast("تم تعديل اسم السائق.");
}

function saveItemPrice(itemId) {
    const item = itemById(itemId);

    if (!item) return;

    const input = document.querySelector(
        `[data-item-price="${CSS.escape(itemId)}"]`
    );

    const raw = input.value.trim();

    const price = Number(raw);

    if (raw === "" || !Number.isFinite(price) || price < 0) {
        alert("أدخل سعرًا صحيحًا.");
        return;
    }

    item.price = price;

    // الفواتير السابقة تحتفظ بالأسعار التي سجلت بها.
    if (!saveState()) return;

    renderAll();

    toast("تم حفظ سعر الصنف.");
}


/* =========================================
   تصفير عمل اليوم
========================================= */

$("resetDayBtn").addEventListener("click", () => {
    const day = currentDay();

    if (!day) {
        alert("لا يوجد يوم عمل حالي.");
        return;
    }

    const count = invoicesForDay(day.id).length;

    const message =
        `هل أنت متأكد من تصفير عمل اليوم؟\n\n` +
        `عدد الفواتير الحالية: ${count}\n\n` +
        `ستبقى الفواتير القديمة محفوظة في الأرشيف، ` +
        `وسيبدأ يوم عمل جديد.`;

    if (!confirm(message)) return;

    // إغلاق يوم العمل الحالي.
    day.closedAt = new Date().toISOString();

    // إنشاء يوم عمل جديد، حتى لو كان التاريخ نفسه.
    const newDay = createDay();

    state.days.push(newDay);

    state.currentDayId = newDay.id;

    if (!saveState()) return;

    document.querySelectorAll(".qty-input").forEach(input => {
        input.value = "";
    });

    renderAll();

    showPage("issuePage");

    toast("تم تصفير عمل اليوم وبدء يوم جديد.");
});


/* =========================================
   الأرشيف
========================================= */

function renderArchiveOptions() {
    const select = $("archiveDay");

    const oldValue = select.value;

    const days = [...state.days].sort(
        (a, b) =>
            new Date(b.startedAt) - new Date(a.startedAt)
    );

    select.innerHTML = `
        <option value="">اختر يومًا</option>

        ${days.map(day => `
            <option value="${escapeHTML(day.id)}">
                ${formatDate(day.date)}
                ${day.id === state.currentDayId ? " — اليوم الحالي" : ""}
                ${day.closedAt ? " — مغلق" : ""}
            </option>
        `).join("")}
    `;

    if (oldValue && days.some(day => day.id === oldValue)) {
        select.value = oldValue;
    } else {
        const previous = days.find(
            day => day.id !== state.currentDayId
        );

        if (previous) {
            select.value = previous.id;
        }
    }
}

$("archiveDay").addEventListener("change", renderArchive);

function renderArchive() {
    const dayId = $("archiveDay").value;

    const container = $("archiveContent");

    if (!dayId) {
        container.innerHTML = `
            <div class="empty-state">
                اختر يوم عمل من القائمة لعرض فواتيره.
            </div>
        `;

        return;
    }

    const day = state.days.find(
        item => item.id === dayId
    );

    if (!day) {
        container.innerHTML = `
            <div class="empty-state">يوم العمل غير موجود.</div>
        `;

        return;
    }

    const invoices = invoicesForDay(dayId).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const driverIds = [
        ...new Set(invoices.map(invoice => invoice.driverId))
    ];

    let html = `
        <div class="summary-info" style="margin-top:20px">

            <div>
                <strong>التاريخ:</strong>
                ${formatDate(day.date)}
            </div>

            <div>
                <strong>عدد الفواتير:</strong>
                ${invoices.length}
            </div>

            <div>
                <strong>الحالة:</strong>
                ${day.closedAt ? "مغلق" : "مفتوح"}
            </div>

        </div>
    `;

    if (!invoices.length) {
        container.innerHTML = html + `
            <div class="empty-state">
                لا توجد فواتير في يوم العمل هذا.
            </div>
        `;

        return;
    }

    html += `
        <h3 style="margin-top:25px">فواتير الصرف</h3>
    `;

    html += invoices.map(invoice => `
        <article class="invoice-card">

            <div class="invoice-card-header">

                <div>
                    <div class="invoice-number">
                        فاتورة رقم ${invoice.number}
                    </div>

                    <div class="invoice-meta">
                        السائق: ${escapeHTML(invoice.driverName)}
                    </div>

                    <div class="invoice-meta">
                        ${escapeHTML(formatDateTime(invoice.createdAt))}
                    </div>
                </div>

                <div class="invoice-total">
                    ${money(invoiceTotal(invoice))} ريال
                </div>

            </div>

            <div class="invoice-buttons">

                <button
                    class="btn btn-small btn-outline"
                    data-archive-print="${escapeHTML(invoice.id)}"
                >
                    طباعة الفاتورة
                </button>

                <button
                    class="btn btn-small btn-primary"
                    data-archive-edit="${escapeHTML(invoice.id)}"
                >
                    تعديل الفاتورة
                </button>

            </div>

        </article>
    `).join("");

    html += `
        <h3 style="margin-top:25px">الفواتير الشاملة للسائقين</h3>

        <div class="management-list">
            ${driverIds.map(driverId => {
                const driver = driverById(driverId);

                if (!driver) return "";

                const result = aggregateDriverInvoices(
                    dayId,
                    driverId
                );

                return `
                    <div class="management-row">

                        <div>
                            <strong>${escapeHTML(driver.name)}</strong>

                            <div class="invoice-meta">
                                ${money(result.total)} ريال
                            </div>
                        </div>

                        <button
                            class="btn btn-small btn-primary"
                            data-archive-summary="${escapeHTML(driverId)}"
                            data-day-id="${escapeHTML(dayId)}"
                        >
                            طباعة الفاتورة الشاملة
                        </button>

                    </div>
                `;
            }).join("")}
        </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll("[data-archive-print]").forEach(button => {
        button.addEventListener("click", () => {
            printInvoice(button.dataset.archivePrint);
        });
    });

    container.querySelectorAll("[data-archive-edit]").forEach(button => {
        button.addEventListener("click", () => {
            const invoice = state.invoices.find(
                item => item.id === button.dataset.archiveEdit
            );

            if (!invoice) return;

            if (invoice.dayId !== state.currentDayId) {
                const ok = confirm(
                    "هذه فاتورة من يوم سابق. هل تريد تعديلها؟\n\n" +
                    "سيتم تحديث الفاتورة الشاملة لذلك اليوم أيضًا."
                );

                if (!ok) return;
            }

            openEditInvoice(invoice.id);
        });
    });

    container.querySelectorAll("[data-archive-summary]").forEach(button => {
        button.addEventListener("click", () => {
            printSummary(
                button.dataset.dayId,
                button.dataset.archiveSummary
            );
        });
    });
}


/* =========================================
   النسخ الاحتياطي والاستعادة
========================================= */

$("exportDataBtn").addEventListener("click", () => {
    const data = JSON.stringify(state, null, 2);

    const blob = new Blob(
        [data],
        { type: "application/json;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = `deerty-backup-${todayISO()}.json`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

    toast("تم تنزيل النسخة الاحتياطية.");
});


$("importDataBtn").addEventListener("click", () => {
    $("importFile").click();
});


$("importFile").addEventListener("change", async event => {
    const file = event.target.files[0];

    if (!file) return;

    try {
        const text = await file.text();

        const imported = JSON.parse(text);

        if (
            !imported ||
            !Array.isArray(imported.drivers) ||
            !Array.isArray(imported.items) ||
            !Array.isArray(imported.days) ||
            !Array.isArray(imported.invoices)
        ) {
            throw new Error("النسخة الاحتياطية غير صالحة");
        }

        const ok = confirm(
            "استعادة النسخة الاحتياطية ستستبدل بيانات النظام الحالية. " +
            "هل تريد المتابعة؟"
        );

        if (!ok) {
            event.target.value = "";
            return;
        }

        state = imported;

        if (!state.currentDayId ||
            !state.days.some(day => day.id === state.currentDayId)) {

            const day = createDay();

            state.days.push(day);

            state.currentDayId = day.id;
        }

        if (!Number.isFinite(state.nextInvoiceNumber)) {
            state.nextInvoiceNumber =
                state.invoices.reduce(
                    (max, invoice) =>
                        Math.max(max, Number(invoice.number) || 0),
                    0
                ) + 1;
        }

        if (!saveState()) return;

        renderAll();

        showPage("issuePage");

        toast("تمت استعادة النسخة الاحتياطية بنجاح.");

    } catch (error) {
        console.error(error);

        alert("تعذرت استعادة الملف. تأكد أنه نسخة احتياطية صحيحة.");

    } finally {
        event.target.value = "";
    }
});


/* =========================================
   تحديث جميع أجزاء النظام
========================================= */

function renderAll() {
    renderDate();

    renderDriverSelects();

    renderProducts();

    renderInvoices();

    renderSummary();

    renderArchiveOptions();

    renderArchive();

    renderManagement();
}


/* =========================================
   بدء التشغيل
========================================= */

function init() {
    renderAll();

    // عند اختلاف تاريخ الجهاز، لا يتم تصفير البيانات القديمة.
    // يُنشأ يوم جديد تلقائيًا عند تشغيل النظام في تاريخ جديد.
    const day = currentDay();

    if (day && day.date !== todayISO()) {
        day.closedAt = day.closedAt || new Date().toISOString();

        const newDay = createDay();

        state.days.push(newDay);

        state.currentDayId = newDay.id;

        saveState();

        renderAll();
    }
}

init();
