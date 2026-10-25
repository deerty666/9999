'use strict';

/* =========================================
   نظام ديرتي - حسابات السائقين
   ========================================= */

const DB_KEY = 'deerty_driver_accounts_v2';

const $ = id => document.getElementById(id);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const money = n =>
  (Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' ر.س';

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

const uid = p =>
  p + '-' + Date.now().toString(36).toUpperCase() +
  '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

const blankDB = () => ({
  version: 2,
  drivers: [],
  items: [],
  invoices: [],
  settlements: [],
  settings: {
    businessName: 'مطاعم ومطابخ سحايب ديرتي',
    businessPhone: '',
    receiptFooter: 'شكرًا لزيارتكم'
  }
});

function loadDB() {
  try {
    const d = JSON.parse(localStorage.getItem(DB_KEY));

    if (d && Array.isArray(d.drivers) &&
        Array.isArray(d.items) &&
        Array.isArray(d.invoices)) {
      return {
        ...blankDB(),
        ...d,
        settlements: Array.isArray(d.settlements) ? d.settlements : [],
        settings: {
          ...blankDB().settings,
          ...d.settings
        }
      };
    }
  } catch (e) {}

  return blankDB();
}

let db = loadDB();
let cart = [];
let reportInvoices = [];

function saveDB() {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function toast(msg) {
  const el = $('toast');
  if (!el) {
    alert(msg);
    return;
  }

  el.textContent = msg;
  el.classList.add('show');

  setTimeout(() => el.classList.remove('show'), 2800);
}

function ask(title, message, callback, options = {}) {
  $('modalTitle').textContent = title;
  $('modalMessage').textContent = message;

  $('modalInputWrap').hidden = !options.amount;
  $('modalNoteWrap').hidden = !options.note;

  $('modalAmount').value = options.initialAmount || 0;
  $('modalNote').value = '';

  $('modalBackdrop').classList.add('show');

  $('modalConfirm').onclick = () => {
    const data = {
      amount: Number($('modalAmount').value) || 0,
      note: $('modalNote').value.trim()
    };

    $('modalBackdrop').classList.remove('show');
    callback(data);
  };
}

$('modalCancel').onclick = () =>
  $('modalBackdrop').classList.remove('show');

/* =========================================
   التنقل بين الصفحات
   ========================================= */

function go(page) {
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  document.querySelectorAll('.page').forEach(s => {
    s.classList.toggle('active', s.id === 'page-' + page);
  });

  if (page === 'reports') runReport();
  if (page === 'history') renderHistory();
  if (page === 'newInvoice') renderPicker();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.tab').forEach(b => {
  b.onclick = () => go(b.dataset.page);
});

document.querySelectorAll('[data-open]').forEach(b => {
  b.onclick = () => go(b.dataset.open);
});

/* =========================================
   السائقون
   ========================================= */

function driverById(id) {
  return db.drivers.find(d => d.id === id);
}

function driverLabel(id) {
  return driverById(id)?.name || 'سائق غير موجود';
}

function activeInvoices() {
  return db.invoices.filter(i => !i.cancelled);
}

function sumInvoices(list) {
  return list.reduce((s, i) => s + (Number(i.total) || 0), 0);
}

function settlementFor(driverId, date) {
  return db.settlements.find(s =>
    s.driverId === driverId && s.date === date
  );
}

function settledAmountForInvoices(list) {
  const ids = new Set(list.map(i => i.id));

  return db.settlements
    .filter(st =>
      Array.isArray(st.invoiceIds) &&
      st.invoiceIds.length &&
      st.invoiceIds.every(id => ids.has(id))
    )
    .reduce((sum, st) => sum + (Number(st.amount) || 0), 0);
}

function fillDriverSelects() {
  const opts = db.drivers
    .filter(d => d.active !== false)
    .map(d =>
      `<option value="${esc(d.id)}">${esc(d.name)}</option>`
    ).join('');

  $('invoiceDriver').innerHTML =
    '<option value="">اختر السائق</option>' + opts;

  $('reportDriver').innerHTML =
    '<option value="">كل السائقين</option>' + opts;
}

function clearDriverForm() {
  $('driverEditId').value = '';
  $('driverName').value = '';
  $('driverPhone').value = '';

  $('driverFormTitle').textContent = 'إضافة سائق';
  $('saveDriverBtn').textContent = 'حفظ السائق';
}

$('saveDriverBtn').onclick = () => {
  const name = $('driverName').value.trim();

  if (!name) return toast('اكتب اسم السائق');

  const id = $('driverEditId').value;

  if (id) {
    const d = driverById(id);

    if (d) {
      d.name = name;
      d.phone = $('driverPhone').value.trim();
    }
  } else {
    db.drivers.push({
      id: uid('DRV'),
      name,
      phone: $('driverPhone').value.trim(),
      active: true,
      createdAt: new Date().toISOString()
    });
  }

  clearDriverForm();
  renderAll();
  toast('تم حفظ السائق');
};

$('cancelDriverEdit').onclick = clearDriverForm;

window.editDriver = id => {
  const d = driverById(id);
  if (!d) return;

  $('driverEditId').value = id;
  $('driverName').value = d.name;
  $('driverPhone').value = d.phone || '';

  $('driverFormTitle').textContent = 'تعديل السائق';
  $('saveDriverBtn').textContent = 'حفظ التعديل';

  go('drivers');
};

window.toggleDriver = id => {
  const d = driverById(id);

  if (d) {
    d.active = d.active === false;
    renderAll();
    toast('تم تحديث حالة السائق');
  }
};

window.deleteDriver = id => {
  if (db.invoices.some(i => i.driverId === id)) {
    return toast('لديه فواتير سابقة؛ عطّله بدل حذفه');
  }

  ask('حذف سائق', 'هل تريد حذف هذا السائق؟', () => {
    db.drivers = db.drivers.filter(d => d.id !== id);
    renderAll();
    toast('تم حذف السائق');
  });
};

function renderDrivers() {
  $('driversRows').innerHTML = db.drivers.length
    ? db.drivers.map(d => {
        const ins = db.invoices.filter(i =>
          i.driverId === d.id && !i.cancelled
        );

        return `
          <tr>
            <td><b>${esc(d.name)}</b></td>
            <td>${esc(d.phone || '—')}</td>
            <td>${ins.length}</td>
            <td>${money(sumInvoices(ins))}</td>
            <td>
              <span class="badge ${d.active === false ? 'badge-red' : 'badge-green'}">
                ${d.active === false ? 'معطّل' : 'نشط'}
              </span>
            </td>
            <td>
              <div class="button-row">
                <button class="btn btn-light btn-sm"
                  onclick="editDriver('${esc(d.id)}')">تعديل</button>

                <button class="btn btn-light btn-sm"
                  onclick="toggleDriver('${esc(d.id)}')">
                  ${d.active === false ? 'تفعيل' : 'تعطيل'}
                </button>

                <button class="btn btn-danger btn-sm"
                  onclick="deleteDriver('${esc(d.id)}')">حذف</button>
              </div>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="6" class="empty">لا يوجد سائقون</td></tr>';
}

/* =========================================
   الأصناف والأسعار والأيقونات
   ========================================= */

function itemIcon(item) {
  const text = `${item.name || ''} ${item.category || ''}`;

  if (/دجاج|دياي|شواي|شواية|شوايه|فروج|طير|ربع حبه|نصف حبه|حبة دجاج/i.test(text)) {
    return '🍗';
  }

  if (/رز|أرز|ارز|بشاور|مندي|مظبي|مضغوط|مدفون|مقلوبه|مقلوبة|كبسة|كبسه|زربيان/i.test(text)) {
    return '🍚';
  }

  if (/لحم|لحوم|حاشي|تيس|خروف|غنم|مفطح|برمة|برمه|مكموت|هرفي/i.test(text)) {
    return '🥩';
  }

  if (/مشروب|ماء|موية|مياه|بيبسي|كولا|عصير|لبن|شاي|قهوة|قهوه/i.test(text)) {
    return '🥤';
  }

  if (/حلى|حلا|كنافة|كنافه|كيك|حلويات/i.test(text)) {
    return '🍰';
  }

  if (/شوربة|شوربه|مرق|إيدام|ايدام|إدام|ادام/i.test(text)) {
    return '🍲';
  }

  if (/سلطة|سلطه|مقبلات|حمص|متبل|طحينة|طحينه/i.test(text)) {
    return '🥗';
  }

  if (/بطاطس|بطاطا|بصل|خضار/i.test(text)) {
    return '🍟';
  }

  if (/خبز|تميس|روتي/i.test(text)) {
    return '🫓';
  }

  return '🍽️';
}

function clearItemForm() {
  $('itemEditId').value = '';
  $('itemName').value = '';
  $('itemPrice').value = '';
  $('itemCategory').value = '';

  $('itemFormTitle').textContent = 'إضافة صنف';
  $('saveItemBtn').textContent = 'حفظ الصنف';
}

$('saveItemBtn').onclick = () => {
  const name = $('itemName').value.trim();
  const price = Number($('itemPrice').value);

  if (!name) return toast('اكتب اسم الصنف');

  if (!Number.isFinite(price) || price < 0) {
    return toast('أدخل سعرًا صحيحًا');
  }

  const id = $('itemEditId').value;

  if (id) {
    const p = db.items.find(x => x.id === id);

    if (p) {
      p.name = name;
      p.price = price;
      p.category = $('itemCategory').value.trim() || 'عام';
    }
  } else {
    db.items.push({
      id: uid('ITM'),
      name,
      price,
      category: $('itemCategory').value.trim() || 'عام',
      active: true
    });
  }

  clearItemForm();
  renderAll();
  toast('تم حفظ الصنف');
};

$('cancelItemEdit').onclick = clearItemForm;

window.editItem = id => {
  const p = db.items.find(x => x.id === id);
  if (!p) return;

  $('itemEditId').value = id;
  $('itemName').value = p.name;
  $('itemPrice').value = p.price;
  $('itemCategory').value = p.category || '';

  $('itemFormTitle').textContent = 'تعديل الصنف';
  $('saveItemBtn').textContent = 'حفظ التعديل';

  go('items');
};

window.toggleItem = id => {
  const p = db.items.find(x => x.id === id);

  if (p) {
    p.active = p.active === false;
    renderAll();
    toast('تم تحديث حالة الصنف');
  }
};

window.deleteItem = id => {
  if (db.invoices.some(i =>
    (i.items || []).some(x => x.itemId === id)
  )) {
    return toast('الصنف مستخدم في فواتير سابقة؛ عطّله بدل حذفه');
  }

  ask('حذف صنف', 'هل تريد حذف هذا الصنف؟', () => {
    db.items = db.items.filter(p => p.id !== id);
    renderAll();
    toast('تم حذف الصنف');
  });
};

function renderItems() {
  $('itemsRows').innerHTML = db.items.length
    ? db.items.map(p => `
      <tr>
        <td>
          <span style="font-size:22px">${itemIcon(p)}</span>
          <b>${esc(p.name)}</b>
        </td>
        <td>${esc(p.category || 'عام')}</td>
        <td>${money(p.price)}</td>
        <td>
          <span class="badge ${p.active === false ? 'badge-red' : 'badge-green'}">
            ${p.active === false ? 'معطّل' : 'نشط'}
          </span>
        </td>
        <td>
          <div class="button-row">
            <button class="btn btn-light btn-sm"
              onclick="editItem('${esc(p.id)}')">تعديل</button>

            <button class="btn btn-light btn-sm"
              onclick="toggleItem('${esc(p.id)}')">
              ${p.active === false ? 'تفعيل' : 'تعطيل'}
            </button>

            <button class="btn btn-danger btn-sm"
              onclick="deleteItem('${esc(p.id)}')">حذف</button>
          </div>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="empty">لا توجد أصناف</td></tr>';
}

/* =========================================
   إنشاء الفاتورة واختيار الأصناف
   ========================================= */

function renderPicker() {
  const q = ($('itemSearch').value || '').trim().toLowerCase();

  const items = db.items.filter(p =>
    p.active !== false &&
    (`${p.name} ${p.category || ''}`).toLowerCase().includes(q)
  );

  $('itemPicker').innerHTML = items.length
    ? items.map(p => `
      <button
        type="button"
        class="item-option"
        data-category="${esc(p.category || 'عام')}"
        onclick="addToCart('${esc(p.id)}')">

        <span class="item-icon">${itemIcon(p)}</span>

        <span class="item-name">${esc(p.name)}</span>

        <span class="item-price">${money(p.price)}</span>

        <span class="item-add">+ إضافة الصنف</span>
      </button>`).join('')
    : '<div class="empty">لا توجد أصناف مطابقة</div>';
}

$('itemSearch').addEventListener('input', renderPicker);

window.addToCart = id => {
  const p = db.items.find(x => x.id === id);
  if (!p) return;

  const it = cart.find(x => x.itemId === id);

  if (it) {
    it.qty++;
  } else {
    cart.push({
      itemId: p.id,
      name: p.name,
      price: Number(p.price),
      qty: 1
    });
  }

  renderCart();
};

function cartSubtotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}

function invoiceGrandTotal() {
  return Math.round((
    cartSubtotal() + Math.max(0, Number($('deliveryFee').value) || 0)
  ) * 100) / 100;
}

function renderCart() {
  $('cartRows').innerHTML = cart.length
    ? cart.map((i, n) => `
      <tr>
        <td>${esc(i.name)}</td>
        <td>${money(i.price)}</td>

        <td>
          <div class="qty">
            <button onclick="changeQty(${n},-1)">−</button>

            <input
              type="number"
              min="1"
              value="${i.qty}"
              onchange="setQty(${n},this.value)">

            <button onclick="changeQty(${n},1)">+</button>
          </div>
        </td>

        <td>${money(i.price * i.qty)}</td>

        <td>
          <button class="btn btn-danger btn-sm"
            onclick="removeCart(${n})">×</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="empty">أضف الأصناف من القائمة</td></tr>';

  $('invoiceTotal').textContent = money(invoiceGrandTotal());
}

$('deliveryFee').addEventListener('input', () => {
  $('invoiceTotal').textContent = money(invoiceGrandTotal());
});

window.changeQty = (n, d) => {
  cart[n].qty = Math.max(1, cart[n].qty + d);
  renderCart();
};

window.setQty = (n, v) => {
  cart[n].qty = Math.max(1, Math.floor(Number(v) || 1));
  renderCart();
};

window.removeCart = n => {
  cart.splice(n, 1);
  renderCart();
};

$('clearInvoiceBtn').onclick = () => {
  cart = [];
  $('customerName').value = '';
  $('customerPhone').value = '';
  $('invoiceNote').value = '';
  $('deliveryFee').value = 0;

  renderCart();
  toast('تم تفريغ الفاتورة');
};

function nextInvoiceId() {
  const prefix = 'DT-' + today().replaceAll('-', '') + '-';

  const n = db.invoices.filter(i =>
    i.id.startsWith(prefix)
  ).length + 1;

  return prefix + String(n).padStart(4, '0');
}

$('saveInvoiceBtn').onclick = () => {
  const driverId = $('invoiceDriver').value;

  if (!driverId) return toast('اختر السائق');
  if (!cart.length) return toast('أضف صنفًا واحدًا على الأقل');

  const fee = Math.max(0, Number($('deliveryFee').value) || 0);
  const subtotal = cartSubtotal();
  const total = Math.round((subtotal + fee) * 100) / 100;

  const inv = {
    id: nextInvoiceId(),
    date: today(),
    createdAt: new Date().toISOString(),
    driverId,
    type: $('invoiceType').value,
    customer: $('customerName').value.trim(),
    phone: $('customerPhone').value.trim(),
    note: $('invoiceNote').value.trim(),
    items: cart.map(x => ({ ...x })),
    subtotal,
    deliveryFee: fee,
    total,
    cancelled: false
  };

  db.invoices.push(inv);
  saveDB();

  cart = [];

  $('customerName').value = '';
  $('customerPhone').value = '';
  $('invoiceNote').value = '';
  $('deliveryFee').value = 0;

  renderAll();
  toast('تم حفظ الفاتورة ' + inv.id);

  printInvoice(inv);
};

/* =========================================
   الطباعة
   ========================================= */

function printMarkup(content) {
  $('printArea').innerHTML = content;
  $('printArea').hidden = false;

  setTimeout(() => {
    window.print();

    setTimeout(() => {
      $('printArea').hidden = true;
    }, 700);
  }, 120);
}

function printInvoice(inv) {
  const s = db.settings;

  const rows = inv.items.map(i => `
    <tr>
      <td>${esc(i.name)} × ${i.qty}</td>
      <td>${money(i.price * i.qty)}</td>
    </tr>`).join('');

  printMarkup(`
    <div class="receipt">
      <h2>${esc(s.businessName)}</h2>

      ${s.businessPhone
        ? `<p class="center">هاتف: ${esc(s.businessPhone)}</p>`
        : ''}

      <div class="rule"></div>

      <h3>فاتورة صرف أصناف</h3>

      <p>رقم الفاتورة: <b>${esc(inv.id)}</b></p>
      <p>التاريخ: ${esc(inv.date)}</p>
      <p>السائق: ${esc(driverLabel(inv.driverId))}</p>
      <p>نوع الطلب: ${esc(inv.type)}</p>

      ${inv.customer ? `<p>العميل: ${esc(inv.customer)}</p>` : ''}
      ${inv.phone ? `<p>الجوال: ${esc(inv.phone)}</p>` : ''}

      <div class="rule"></div>

      <table>
        <thead>
          <tr><th>الصنف والكمية</th><th>المبلغ</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="rule"></div>

      <p>مجموع الأصناف: <b>${money(inv.subtotal)}</b></p>
      <p>رسوم التوصيل: <b>${money(inv.deliveryFee)}</b></p>
      <p class="big">الإجمالي: ${money(inv.total)}</p>

      ${inv.note ? `<p>ملاحظات: ${esc(inv.note)}</p>` : ''}

      <div class="rule"></div>
      <p class="center">${esc(s.receiptFooter || '')}</p>
    </div>
  `);
}

window.reprintInvoice = id => {
  const i = db.invoices.find(x => x.id === id);
  if (i) printInvoice(i);
};

window.cancelInvoice = id => {
  const i = db.invoices.find(x => x.id === id);

  if (!i || i.cancelled) return;

  ask(
    'إلغاء فاتورة',
    `إلغاء الفاتورة ${id}؟ ستبقى محفوظة في السجل بحالة ملغاة.`,
    () => {
      i.cancelled = true;
      i.cancelledAt = new Date().toISOString();

      renderAll();
      toast('تم إلغاء الفاتورة');
    }
  );
};

/* =========================================
   الأرشيف والبحث
   ========================================= */

function renderHistory() {
  const q = ($('historySearch').value || '').toLowerCase().trim();
  const status = $('historyStatus').value;
  const from = $('historyFrom').value;
  const to = $('historyTo').value;

  const list = [...db.invoices]
    .filter(i =>
      (!q || `${i.id} ${driverLabel(i.driverId)} ${i.customer || ''} ${i.phone || ''}`
        .toLowerCase().includes(q)) &&
      (!status || (status === 'cancelled' ? i.cancelled : !i.cancelled)) &&
      (!from || i.date >= from) &&
      (!to || i.date <= to)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  $('historyRows').innerHTML = list.length
    ? list.map(i => {
        const st = settlementFor(i.driverId, i.date);
        const included = st && st.invoiceIds.includes(i.id);

        return `
          <tr>
            <td><b>${esc(i.id)}</b></td>
            <td>${esc(i.date)}</td>
            <td>${esc(driverLabel(i.driverId))}</td>
            <td>${esc(i.customer || '—')}</td>
            <td>${money(i.total)}</td>

            <td>
              <span class="badge ${included ? 'badge-green' : 'badge-gold'}">
                ${included ? 'تمت التسوية' : 'غير مسوّاة'}
              </span>
            </td>

            <td>
              <span class="badge ${i.cancelled ? 'badge-red' : 'badge-green'}">
                ${i.cancelled ? 'ملغاة' : 'فعالة'}
              </span>
            </td>

            <td>
              <div class="button-row">
                <button class="btn btn-light btn-sm"
                  onclick="reprintInvoice('${esc(i.id)}')">
                  إعادة طباعة
                </button>

                ${i.cancelled ? '' : `
                  <button class="btn btn-danger btn-sm"
                    onclick="cancelInvoice('${esc(i.id)}')">
                    إلغاء
                  </button>
                `}
              </div>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="8" class="empty">لا توجد فواتير مطابقة</td></tr>';
}

['historySearch', 'historyStatus', 'historyFrom', 'historyTo']
  .forEach(id => $(id).addEventListener('input', renderHistory));

/* =========================================
   الزر الجديد: تصفير الأرشيف السابق
   يحذف الأيام السابقة ويحتفظ بفواتير اليوم
   ========================================= */

$('clearArchiveBtn').onclick = () => {
  const oldInvoices = db.invoices.filter(i => i.date < today());
  const oldSettlements = db.settlements.filter(s => s.date < today());

  if (!oldInvoices.length && !oldSettlements.length) {
    return toast('لا توجد فواتير قديمة في الأرشيف');
  }

  ask(
    'تصفير الأرشيف السابق',
    `سيتم حذف ${oldInvoices.length} فاتورة قديمة و${oldSettlements.length} تسوية من الأيام السابقة. ستبقى فواتير اليوم والسائقون والأصناف والأسعار كما هي. هل تريد المتابعة؟`,
    () => {
      db.invoices = db.invoices.filter(i => i.date >= today());
      db.settlements = db.settlements.filter(s => s.date >= today());

      saveDB();
      renderAll();

      toast('تم تصفير الأرشيف السابق');
    }
  );
};

/* =========================================
   التقارير
   ========================================= */

function runReport() {
  const from = $('reportFrom').value || today();
  const to = $('reportTo').value || today();
  const driver = $('reportDriver').value;

  reportInvoices = activeInvoices()
    .filter(i =>
      i.date >= from &&
      i.date <= to &&
      (!driver || i.driverId === driver)
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const sales = sumInvoices(reportInvoices);
  const settled = settledAmountForInvoices(reportInvoices);

  $('reportSales').textContent = money(sales);
  $('reportPaid').textContent = money(settled);
  $('reportDue').textContent = money(Math.max(0, sales - settled));
  $('reportCount').textContent = reportInvoices.length;

  $('reportRows').innerHTML = reportInvoices.length
    ? reportInvoices.map(i => {
        const st = settlementFor(i.driverId, i.date);
        const done = st && st.invoiceIds.includes(i.id);

        return `
          <tr>
            <td>${esc(i.date)}</td>
            <td>${esc(i.id)}</td>
            <td>${esc(driverLabel(i.driverId))}</td>
            <td>${money(i.total)}</td>
            <td>
              <span class="badge ${done ? 'badge-green' : 'badge-gold'}">
                ${done ? 'تمت التسوية' : 'غير مسوّاة'}
              </span>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="5" class="empty">لا توجد فواتير في الفترة المحددة</td></tr>';

  renderSettlements();
}

$('runReportBtn').onclick = runReport;

/* =========================================
   فاتورة موحدة لجميع السائقين
   تجمع الأصناف والكميات وإجمالي كل صنف
   ========================================= */

$('printAllDriversReportBtn').onclick = () => {
  const from = $('reportFrom').value || today();
  const to = $('reportTo').value || today();

  const invoices = activeInvoices().filter(i =>
    i.date >= from && i.date <= to
  );

  if (!invoices.length) {
    return toast('لا توجد فواتير لجميع السائقين في هذه الفترة');
  }

  const products = new Map();
  const drivers = new Map();

  let grandTotal = 0;
  let deliveryTotal = 0;

  invoices.forEach(inv => {
    const driverId = inv.driverId;

    if (!drivers.has(driverId)) {
      drivers.set(driverId, {
        name: driverLabel(driverId),
        invoiceCount: 0,
        total: 0
      });
    }

    const d = drivers.get(driverId);
    d.invoiceCount++;
    d.total += Number(inv.total) || 0;

    grandTotal += Number(inv.total) || 0;
    deliveryTotal += Number(inv.deliveryFee) || 0;

    (inv.items || []).forEach(item => {
      const key = item.itemId || `${item.name}_${item.price}`;

      if (!products.has(key)) {
        products.set(key, {
          name: item.name,
          qty: 0,
          price: Number(item.price) || 0,
          total: 0
        });
      }

      const p = products.get(key);
      p.qty += Number(item.qty) || 0;
      p.total += (Number(item.qty) || 0) * (Number(item.price) || 0);
    });
  });

  const productRows = [...products.values()].map(p => `
    <tr>
      <td>${esc(p.name)}</td>
      <td>${p.qty}</td>
      <td>${money(p.price)}</td>
      <td>${money(p.total)}</td>
    </tr>
  `).join('');

  const driverRows = [...drivers.values()].map(d => `
    <tr>
      <td>${esc(d.name)}</td>
      <td>${d.invoiceCount}</td>
      <td>${money(d.total)}</td>
    </tr>
  `).join('');

  const totalQty = [...products.values()].reduce(
    (sum, p) => sum + p.qty, 0
  );

  printMarkup(`
    <div class="receipt">

      <h2>${esc(db.settings.businessName)}</h2>
      <h3>تقرير موحّد لجميع السائقين</h3>

      <p>من تاريخ: ${esc(from)}</p>
      <p>إلى تاريخ: ${esc(to)}</p>
      <p>تاريخ الطباعة: ${esc(today())}</p>

      <div class="rule"></div>

      <h3>تفاصيل الأصناف والكميات</h3>

      <table>
        <thead>
          <tr>
            <th>الصنف</th>
            <th>الكمية</th>
            <th>سعر الوحدة</th>
            <th>الإجمالي</th>
          </tr>
        </thead>

        <tbody>
          ${productRows}
        </tbody>
      </table>

      <div class="rule"></div>

      <p>إجمالي عدد الأصناف المجمّعة: <b>${products.size}</b></p>
      <p>إجمالي الكميات: <b>${totalQty}</b></p>
      <p>رسوم التوصيل: <b>${money(deliveryTotal)}</b></p>
      <p class="big">الإجمالي النهائي: ${money(grandTotal)}</p>

      <div class="rule"></div>

      <h3>ملخص السائقين</h3>

      <table>
        <thead>
          <tr>
            <th>السائق</th>
            <th>الفواتير</th>
            <th>الإجمالي</th>
          </tr>
        </thead>

        <tbody>
          ${driverRows}
        </tbody>
      </table>

      <div class="rule"></div>

      <p>عدد الفواتير: <b>${invoices.length}</b></p>
      <p class="center">${esc(db.settings.receiptFooter || 'نهاية التقرير')}</p>

    </div>
  `);
};

/* =========================================
   تقرير الفواتير العادي
   ========================================= */

$('printReportBtn').onclick = () => {
  const sales = sumInvoices(reportInvoices);
  const paid = settledAmountForInvoices(reportInvoices);

  const rows = reportInvoices.map(i => `
    <tr>
      <td>
        ${esc(i.date)}<br>
        ${esc(i.id)}<br>
        ${esc(driverLabel(i.driverId))}
      </td>
      <td>${money(i.total)}</td>
    </tr>
  `).join('');

  printMarkup(`
    <div class="receipt">

      <h2>${esc(db.settings.businessName)}</h2>
      <h3>تقرير حسابات السائقين</h3>

      <p>من ${esc($('reportFrom').value || today())}</p>
      <p>إلى ${esc($('reportTo').value || today())}</p>

      <div class="rule"></div>

      <p>المبيعات: ${money(sales)}</p>
      <p>المسلّم: ${money(paid)}</p>
      <p>المتبقي: ${money(Math.max(0, sales - paid))}</p>

      <div class="rule"></div>

      <table>
        <thead>
          <tr><th>الفاتورة والسائق</th><th>الإجمالي</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

    </div>
  `);
};

/* =========================================
   التسويات
   ========================================= */

$('closeDriverBtn').onclick = () => {
  const driverId = $('reportDriver').value;
  const from = $('reportFrom').value || today();
  const to = $('reportTo').value || today();

  if (!driverId) return toast('اختر سائقًا محددًا');

  if (from !== to) {
    return toast('اختر يومًا واحدًا فقط لإغلاق الحساب');
  }

  const invoices = activeInvoices().filter(i =>
    i.driverId === driverId && i.date === from
  );

  if (!invoices.length) {
    return toast('لا توجد فواتير لهذا السائق في هذا اليوم');
  }

  if (settlementFor(driverId, from)) {
    return toast('هذا الحساب مغلق مسبقًا. راجع سجل التسويات.');
  }

  const sales = sumInvoices(invoices);

  ask(
    'تسوية وإغلاق حساب',
    `السائق: ${driverLabel(driverId)}
تاريخ الحساب: ${from}
إجمالي الفواتير: ${money(sales)}
أدخل المبلغ الذي سلّمه السائق فعليًا للمحاسب.`,
    ({ amount, note }) => {
      const settlement = {
        id: uid('SET'),
        driverId,
        date: from,
        sales,
        amount,
        difference: Math.round((sales - amount) * 100) / 100,
        note,
        invoiceIds: invoices.map(i => i.id),
        createdAt: new Date().toISOString()
      };

      db.settlements.push(settlement);

      renderAll();
      toast('تم حفظ التسوية وإغلاق الحساب');

      printSettlement(settlement);
    },
    {
      amount: true,
      note: true,
      initialAmount: sales
    }
  );
};

function renderSettlements() {
  $('settlementsRows').innerHTML = db.settlements.length
    ? [...db.settlements]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(s => `
          <tr>
            <td>${esc(s.date)}</td>
            <td>${esc(driverLabel(s.driverId))}</td>
            <td>${money(s.sales)}</td>
            <td>${money(s.amount)}</td>
            <td>
              <span class="badge ${Math.abs(s.difference) < 0.01 ? 'badge-green' : 'badge-red'}">
                ${money(s.difference)}
              </span>
            </td>
            <td>${esc(s.note || '—')}</td>
            <td>
              <button class="btn btn-light btn-sm"
                onclick="reprintSettlement('${esc(s.id)}')">
                طباعة
              </button>
            </td>
          </tr>
        `).join('')
    : '<tr><td colspan="7" class="empty">لا توجد تسويات مسجلة</td></tr>';
}

function printSettlement(s) {
  printMarkup(`
    <div class="receipt">

      <h2>${esc(db.settings.businessName)}</h2>
      <h3>تسوية حساب سائق</h3>

      <p>التاريخ: ${esc(s.date)}</p>
      <p>السائق: ${esc(driverLabel(s.driverId))}</p>

      <div class="rule"></div>

      <p>إجمالي الفواتير: <b>${money(s.sales)}</b></p>
      <p>المبلغ المستلم فعليًا: <b>${money(s.amount)}</b></p>
      <p class="big">الفرق: ${money(s.difference)}</p>

      <p>ملاحظات: ${esc(s.note || 'لا يوجد')}</p>

      <div class="rule"></div>

      <p>توقيع السائق: ______________</p>
      <p>توقيع المحاسب: ______________</p>

      <p class="center">${esc(db.settings.receiptFooter || '')}</p>

    </div>
  `);
}

window.reprintSettlement = id => {
  const s = db.settlements.find(x => x.id === id);
  if (s) printSettlement(s);
};

/* =========================================
   الرئيسية والإحصائيات
   ========================================= */

function renderDashboard() {
  const date = today();

  const ins = activeInvoices().filter(i => i.date === date);
  const sales = sumInvoices(ins);
  const paid = settledAmountForInvoices(ins);

  $('todayText').textContent = 'تاريخ اليوم: ' + date;
  $('statSales').textContent = money(sales);
  $('statDue').textContent = money(Math.max(0, sales - paid));
  $('statInvoices').textContent = ins.length;

  $('statDrivers').textContent =
    db.drivers.filter(d => d.active !== false).length;

  const latest = [...db.invoices]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 7);

  $('recentInvoices').innerHTML = latest.length
    ? latest.map(i => `
      <tr>
        <td>${esc(i.id)}</td>
        <td>${esc(driverLabel(i.driverId))}</td>
        <td>${money(i.total)}</td>
        <td>${esc(i.date)}</td>
        <td>
          <button class="btn btn-light btn-sm"
            onclick="reprintInvoice('${esc(i.id)}')">طباعة</button>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="5" class="empty">لا توجد فواتير بعد</td></tr>';

  $('driverSummary').innerHTML = db.drivers.length
    ? db.drivers.map(d => {
        const a = ins.filter(i => i.driverId === d.id);
        const driverSales = sumInvoices(a);
        const st = settlementFor(d.id, date);
        const turned = st ? st.amount : 0;

        return `
          <tr>
            <td>${esc(d.name)}</td>
            <td>${a.length}</td>
            <td>${money(driverSales)}</td>
            <td>${money(turned)}</td>
            <td>${money(Math.max(0, driverSales - turned))}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="5" class="empty">أضف السائقين من تبويب السائقون</td></tr>';
}

/* =========================================
   إعدادات الفاتورة والنسخ الاحتياطي
   ========================================= */

function loadSettings() {
  $('businessName').value = db.settings.businessName || '';
  $('businessPhone').value = db.settings.businessPhone || '';
  $('receiptFooter').value = db.settings.receiptFooter || '';
}

$('saveSettingsBtn').onclick = () => {
  db.settings.businessName =
    $('businessName').value.trim() || 'ديرتي';

  db.settings.businessPhone =
    $('businessPhone').value.trim();

  db.settings.receiptFooter =
    $('receiptFooter').value.trim();

  saveDB();
  toast('تم حفظ بيانات الفاتورة');
};

function downloadFile(content, name, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = name;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBackup() {
  downloadFile(
    JSON.stringify({
      ...db,
      exportedAt: new Date().toISOString(),
      app: 'deerty-driver-pwa'
    }, null, 2),
    'deerty-backup-' + today() + '.json',
    'application/json'
  );
}

$('backupQuickBtn').onclick = exportBackup;
$('exportBackupBtn').onclick = exportBackup;

$('importBackupBtn').onclick = () => $('backupFile').click();

$('backupFile').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;

  try {
    const d = JSON.parse(await f.text());

    if (!Array.isArray(d.drivers) ||
        !Array.isArray(d.items) ||
        !Array.isArray(d.invoices)) {
      throw new Error('invalid');
    }

    ask(
      'استعادة نسخة احتياطية',
      'ستُستبدل البيانات الحالية بالنسخة المختارة. هل تريد المتابعة؟',
      () => {
        db = {
          ...blankDB(),
          ...d,
          settlements: Array.isArray(d.settlements) ? d.settlements : [],
          settings: {
            ...blankDB().settings,
            ...(d.settings || {})
          }
        };

        saveDB();
        renderAll();
        toast('تمت استعادة النسخة');
      }
    );

  } catch (err) {
    toast('ملف النسخة غير صالح');
  }

  e.target.value = '';
};

/* =========================================
   تصدير التقرير إلى CSV
   ========================================= */

$('exportCsvBtn').onclick = () => {
  const rows = [
    ['التاريخ', 'رقم الفاتورة', 'السائق', 'العميل', 'الإجمالي', 'الحالة'],

    ...reportInvoices.map(i => [
      i.date,
      i.id,
      driverLabel(i.driverId),
      i.customer || '',
      i.total,
      settlementFor(i.driverId, i.date) ? 'تمت التسوية' : 'غير مسوّاة'
    ])
  ];

  const csv = '\ufeff' + rows.map(row =>
    row.map(v =>
      '"' + String(v ?? '').replace(/"/g, '""') + '"'
    ).join(',')
  ).join('\r\n');

  downloadFile(
    csv,
    'deerty-report-' + today() + '.csv',
    'text/csv;charset=utf-8'
  );

  toast('تم تصدير التقرير');
};

/* =========================================
   مسح البيانات بالكامل
   ========================================= */

$('resetBtn').onclick = () => {
  ask(
    'مسح جميع البيانات',
    'سيتم حذف السائقين والأصناف والفواتير والتسويات من هذا المتصفح نهائيًا. نزّل نسخة احتياطية أولًا. هل أنت متأكد؟',
    () => {
      db = blankDB();
      cart = [];

      renderAll();
      toast('تم مسح البيانات');
    }
  );
};

/* =========================================
   تثبيت التطبيق PWA
   ========================================= */

let installPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  $('installBtn').hidden = false;
});

$('installBtn').onclick = async () => {
  if (!installPrompt) {
    toast('افتح قائمة المتصفح واختر تثبيت التطبيق إذا كان الخيار متاحًا');
    return;
  }

  installPrompt.prompt();
  await installPrompt.userChoice;

  installPrompt = null;
  $('installBtn').hidden = true;
};

window.addEventListener('appinstalled', () => {
  toast('تم تثبيت تطبيق ديرتي');
  $('installBtn').hidden = true;
});

if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

/* =========================================
   تشغيل النظام
   ========================================= */

function renderAll() {
  saveDB();

  fillDriverSelects();
  renderDashboard();
  renderDrivers();
  renderItems();
  renderPicker();
  renderCart();
  renderHistory();
  runReport();
  renderSettlements();
  loadSettings();
}

$('reportFrom').value = today();
$('reportTo').value = today();

renderAll();
