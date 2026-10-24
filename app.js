(() => {
    "use strict";

    const $ = id => document.getElementById(id);

    const STORAGE_KEY = "deerty_delivery_ledger_pro_v1";
    const DRIVER_COUNT = 10;

    const CASHIER_TYPES = [
        "الشبكة",
        "الكاش",
        "هنقرستيشن",
        "المصروفات",
        "الدين"
    ];

    let db = loadDB();
    let activeDate = today();
    let deferredInstallPrompt = null;


    /* =========================
       أدوات عامة
    ========================= */

    function today() {
        const d = new Date();

        return [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, "0"),
            String(d.getDate()).padStart(2, "0")
        ].join("-");
    }

    function hasValue(value) {
        return value !== "" &&
               value !== null &&
               value !== undefined;
    }

    function numberValue(value) {
        if (!hasValue(value)) return 0;

        const number = Number(value);

        return Number.isFinite(number) ? number : 0;
    }

    function money(value) {
        return Number(value).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + " ر.س";
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    function blankDriver(name = "") {
        return {
            name,
            addition: "",
            account: "",
            network: "",
            petrol: "",
            workRate: "",
            expenses: ""
        };
    }

    function blankDay() {
        return {
            managerName: "",

            drivers: Array.from(
                { length: DRIVER_COUNT },
                () => blankDriver()
            ),

            debts: [],

            cashier: CASHIER_TYPES.map(type => ({
                type,
                amount: "",
                note: ""
            }))
        };
    }


    /* =========================
       تحميل وحفظ البيانات
    ========================= */

    function loadDB() {
        try {
            const saved = JSON.parse(
                localStorage.getItem(STORAGE_KEY) || "{}"
            );

            return {
                roster: Array.isArray(saved.roster)
                    ? saved.roster
                    : Array(DRIVER_COUNT).fill(""),

                days: saved.days &&
                      typeof saved.days === "object"
                    ? saved.days
                    : {}
            };

        } catch (error) {
            return {
                roster: Array(DRIVER_COUNT).fill(""),
                days: {}
            };
        }
    }

    function saveDB() {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(db)
            );

            $("statusMessage").textContent =
                "تم الحفظ تلقائيًا — " + activeDate;

        } catch (error) {
            $("statusMessage").textContent =
                "تعذر الحفظ. تأكد من توفر مساحة في المتصفح.";
        }
    }

    function normalizeDay(day) {
        if (!Array.isArray(day.drivers)) {
            day.drivers = [];
        }

        while (day.drivers.length < DRIVER_COUNT) {
            day.drivers.push(blankDriver());
        }

        day.drivers = day.drivers
            .slice(0, DRIVER_COUNT)
            .map((driver, index) => ({
                ...blankDriver(db.roster[index] || ""),
                ...driver,

                name: typeof driver.name === "string"
                    ? driver.name
                    : (db.roster[index] || "")
            }));

        if (!Array.isArray(day.debts)) {
            day.debts = [];
        }

        if (!Array.isArray(day.cashier)) {
            day.cashier = [];
        }

        day.cashier = CASHIER_TYPES.map(type => {
            const oldRow = day.cashier.find(
                row => row.type === type
            );

            return oldRow || {
                type,
                amount: "",
                note: ""
            };
        });

        if (typeof day.managerName !== "string") {
            day.managerName = "";
        }
    }

    function ensureDay(date) {
        if (!db.days[date]) {
            const day = blankDay();

            day.drivers.forEach((driver, index) => {
                driver.name = db.roster[index] || "";
            });

            db.days[date] = day;
        }

        normalizeDay(db.days[date]);

        return db.days[date];
    }

    function currentDay() {
        return ensureDay(activeDate);
    }


    /* =========================
       حساب السائق
    ========================= */

    function calculateDriver(driver) {
        const fields = [
            driver.addition,
            driver.account,
            driver.network,
            driver.petrol,
            driver.workRate,
            driver.expenses
        ];

        const entered = fields.some(hasValue);

        const remaining =
            numberValue(driver.addition) +
            numberValue(driver.account) -
            numberValue(driver.network) -
            numberValue(driver.petrol) -
            numberValue(driver.workRate) -
            numberValue(driver.expenses);

        return {
            entered,
            remaining
        };
    }


    /* =========================
       إنشاء خانات الإدخال
    ========================= */

    function textInput(value, attributes = "") {
        return `
            <input
                value="${escapeHTML(value)}"
                autocomplete="off"
                ${attributes}
            >
        `;
    }

    function numberInput(value, key, index, group) {
        return `
            <input
                class="amount-input"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                data-group="${group}"
                data-index="${index}"
                data-key="${key}"
                value="${hasValue(value) ? escapeHTML(value) : ""}"
                placeholder="—"
                aria-label="${escapeHTML(key)}"
            >
        `;
    }


    /* =========================
       عرض جدول السائقين
    ========================= */

    function renderDrivers() {
        const day = currentDay();

        $("driversBody").innerHTML =
            day.drivers.map((driver, index) => {
                const result = calculateDriver(driver);

                return `
                    <tr data-driver-row="${index}">

                        <td>
                            ${textInput(
                                driver.name,
                                `
                                class="name-input"
                                type="text"
                                data-group="driver"
                                data-index="${index}"
                                data-key="name"
                                placeholder="اسم السائق ${index + 1}"
                                aria-label="اسم السائق ${index + 1}"
                                `
                            )}
                        </td>

                        <td>
                            ${numberInput(
                                driver.addition,
                                "addition",
                                index,
                                "driver"
                            )}
                        </td>

                        <td>
                            ${numberInput(
                                driver.account,
                                "account",
                                index,
                                "driver"
                            )}
                        </td>

                        <td>
                            ${numberInput(
                                driver.network,
                                "network",
                                index,
                                "driver"
                            )}
                        </td>

                        <td>
                            ${numberInput(
                                driver.petrol,
                                "petrol",
                                index,
                                "driver"
                            )}
                        </td>

                        <td>
                            ${numberInput(
                                driver.workRate,
                                "workRate",
                                index,
                                "driver"
                            )}
                        </td>

                        <td>
                            ${numberInput(
                                driver.expenses,
                                "expenses",
                                index,
                                "driver"
                            )}
                        </td>

                        <td
                            class="remaining-cell"
                            data-remaining="${index}">
                            ${result.entered
                                ? money(result.remaining)
                                : "—"}
                        </td>

                        <td class="no-print">
                            <button
                                class="delete-btn"
                                type="button"
                                data-clear-driver="${index}">
                                تفريغ
                            </button>
                        </td>

                    </tr>
                `;
            }).join("");

        renderDriversTotals();
        updateDriverCount();
    }

    function renderDriversTotals() {
        const day = currentDay();

        const keys = [
            "addition",
            "account",
            "network",
            "petrol",
            "workRate",
            "expenses"
        ];

        const totals = keys.map(key => {
            const hasAny = day.drivers.some(
                driver => hasValue(driver[key])
            );

            if (!hasAny) return null;

            return day.drivers.reduce(
                (sum, driver) =>
                    sum + numberValue(driver[key]),
                0
            );
        });

        const calculated = day.drivers
            .map(calculateDriver)
            .filter(result => result.entered);

        const remainingTotal = calculated.length
            ? calculated.reduce(
                (sum, result) => sum + result.remaining,
                0
            )
            : null;

        $("driversFoot").innerHTML = `
            <tr>
                <th>الإجمالي</th>

                ${totals.map(total => `
                    <th>
                        ${total === null ? "—" : money(total)}
                    </th>
                `).join("")}

                <th>
                    ${remainingTotal === null
                        ? "—"
                        : money(remainingTotal)}
                </th>

                <th class="no-print"></th>
            </tr>
        `;

        $("driversRemaining").textContent =
            remainingTotal === null
                ? "—"
                : money(remainingTotal);
    }

    function updateDriverCount() {
        const count = currentDay().drivers.filter(
            driver => driver.name.trim() !== ""
        ).length;

        $("driversEntered").textContent =
            count + " / " + DRIVER_COUNT;
    }


    /* =========================
       جدول ديون السائقين
    ========================= */

    function renderDebts() {
        const debts = currentDay().debts;

        if (debts.length === 0) {
            $("debtsBody").innerHTML = `
                <tr>
                    <td colspan="4" class="empty-row">
                        لا توجد ديون مسجلة لهذا اليوم.
                    </td>
                </tr>
            `;
        } else {
            $("debtsBody").innerHTML =
                debts.map((debt, index) => `
                    <tr>

                        <td>
                            ${textInput(
                                debt.name || "",
                                `
                                type="text"
                                data-group="debt"
                                data-index="${index}"
                                data-key="name"
                                placeholder="اسم السائق"
                                aria-label="اسم السائق"
                                `
                            )}
                        </td>

                        <td>
                            ${textInput(
                                debt.note || "",
                                `
                                type="text"
                                class="note-input"
                                data-group="debt"
                                data-index="${index}"
                                data-key="note"
                                placeholder="سبب الدين"
                                aria-label="البيان"
                                `
                            )}
                        </td>

                        <td>
                            ${numberInput(
                                debt.amount,
                                "amount",
                                index,
                                "debt"
                            )}
                        </td>

                        <td class="no-print">
                            <button
                                class="delete-btn"
                                type="button"
                                data-delete-debt="${index}">
                                حذف
                            </button>
                        </td>

                    </tr>
                `).join("");
        }

        renderDebtTotals();
    }

    function renderDebtTotals() {
        const debts = currentDay().debts;

        const hasAny = debts.some(
            debt => hasValue(debt.amount)
        );

        const total = hasAny
            ? debts.reduce(
                (sum, debt) => sum + numberValue(debt.amount),
                0
            )
            : null;

        $("debtsTotal").textContent =
            total === null ? "—" : money(total);

        $("debtsSummary").textContent =
            total === null ? "—" : money(total);
    }


    /* =========================
       حساب كاشير التوصيل
    ========================= */

    function renderCashier() {
        const rows = currentDay().cashier;

        $("cashierBody").innerHTML =
            rows.map((row, index) => `
                <tr>

                    <td>${escapeHTML(row.type)}</td>

                    <td>
                        ${numberInput(
                            row.amount,
                            "amount",
                            index,
                            "cashier"
                        )}
                    </td>

                    <td>
                        ${textInput(
                            row.note || "",
                            `
                            type="text"
                            class="note-input"
                            data-group="cashier"
                            data-index="${index}"
                            data-key="note"
                            placeholder="ملاحظة"
                            aria-label="ملاحظة"
                            `
                        )}
                    </td>

                </tr>
            `).join("");

        renderCashierTotals();
    }

    function renderCashierTotals() {
        const rows = currentDay().cashier;

        const hasAny = rows.some(
            row => hasValue(row.amount)
        );

        const total = hasAny
            ? rows.reduce(
                (sum, row) => sum + numberValue(row.amount),
                0
            )
            : null;

        $("cashierTotal").textContent =
            total === null ? "—" : money(total);

        $("cashierSummary").textContent =
            total === null ? "—" : money(total);
    }


    /* =========================
       عرض التطبيق
    ========================= */

    function renderAll() {
        const day = currentDay();

        $("managerName").value = day.managerName || "";

        renderDrivers();
        renderDebts();
        renderCashier();

        saveDB();
    }


    /* =========================
       التعامل مع تغييرات الخانات
    ========================= */

    document.addEventListener("input", event => {
        const element = event.target;

        if (!element.dataset.group) return;

        const group = element.dataset.group;
        const index = Number(element.dataset.index);
        const key = element.dataset.key;

        const day = currentDay();

        if (group === "driver") {
            const driver = day.drivers[index];

            if (!driver) return;

            driver[key] = element.value;

            if (key === "name") {
                db.roster[index] = element.value;
            }

            const result = calculateDriver(driver);

            const remaining = document.querySelector(
                `[data-remaining="${index}"]`
            );

            if (remaining) {
                remaining.textContent = result.entered
                    ? money(result.remaining)
                    : "—";
            }

            renderDriversTotals();
            updateDriverCount();
        }

        if (group === "debt") {
            const debt = day.debts[index];

            if (!debt) return;

            debt[key] = element.value;

            renderDebtTotals();
        }

        if (group === "cashier") {
            const row = day.cashier[index];

            if (!row) return;

            row[key] = element.value;

            renderCashierTotals();
        }

        saveDB();
    });


    /* =========================
       أزرار الجداول
    ========================= */

    document.addEventListener("click", event => {

        const clearButton = event.target.closest(
            "[data-clear-driver]"
        );

        if (clearButton) {
            const index = Number(
                clearButton.dataset.clearDriver
            );

            const day = currentDay();

            const oldName = day.drivers[index].name;

            day.drivers[index] = blankDriver(oldName);

            renderDrivers();
            saveDB();

            return;
        }


        const deleteButton = event.target.closest(
            "[data-delete-debt]"
        );

        if (deleteButton) {
            const index = Number(
                deleteButton.dataset.deleteDebt
            );

            currentDay().debts.splice(index, 1);

            renderDebts();
            saveDB();
        }

    });


    /* =========================
       إضافة دين جديد
    ========================= */

    $("addDebtBtn").addEventListener("click", () => {
        currentDay().debts.push({
            name: "",
            note: "",
            amount: ""
        });

        renderDebts();
        saveDB();

        const inputs = $("debtsBody").querySelectorAll(
            'input[data-key="name"]'
        );

        if (inputs.length) {
            inputs[inputs.length - 1].focus();
        }
    });


    /* =========================
       اختيار التاريخ
    ========================= */

    $("workDate").value = activeDate;

    $("workDate").addEventListener("change", () => {
        const date = $("workDate").value;

        if (!date) return;

        activeDate = date;

        ensureDay(activeDate);

        renderAll();
    });


    /* =========================
       اسم المسؤول
    ========================= */

    $("managerName").addEventListener("input", () => {
        currentDay().managerName =
            $("managerName").value;

        saveDB();
    });


    /* =========================
       بدء يوم جديد
    ========================= */

    $("newDayBtn").addEventListener("click", () => {
        $("confirmModal").classList.remove("hidden");
    });

    $("cancelNewDay").addEventListener("click", () => {
        $("confirmModal").classList.add("hidden");
    });

    $("confirmNewDay").addEventListener("click", () => {
        $("confirmModal").classList.add("hidden");

        const date = $("workDate").value || today();

        const existing = db.days[date];

        if (existing) {
            const hasData =
                existing.debts.length > 0 ||
                existing.drivers.some(driver =>
                    [
                        driver.addition,
                        driver.account,
                        driver.network,
                        driver.petrol,
                        driver.workRate,
                        driver.expenses
                    ].some(hasValue)
                ) ||
                existing.cashier.some(row =>
                    hasValue(row.amount) || row.note
                );

            if (hasData) {
                activeDate = date;

                renderAll();

                $("statusMessage").textContent =
                    "هذا التاريخ يحتوي على حساب محفوظ؛ تم تحميله دون مسح البيانات.";

                return;
            }
        }

        db.days[date] = blankDay();

        db.days[date].drivers.forEach((driver, index) => {
            driver.name = db.roster[index] || "";
        });

        activeDate = date;

        $("workDate").value = date;

        renderAll();
    });


    /* =========================
       تصدير نسخة احتياطية
    ========================= */

    $("exportBtn").addEventListener("click", () => {
        const blob = new Blob(
            [JSON.stringify(db, null, 2)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;

        link.download =
            "نسخة-حسابات-السائقين-" + today() + ".json";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        $("statusMessage").textContent =
            "تم تنزيل النسخة الاحتياطية.";
    });


    /* =========================
       استيراد نسخة احتياطية
    ========================= */

    $("importFile").addEventListener("change", async event => {
        const file = event.target.files?.[0];

        if (!file) return;

        try {
            const imported = JSON.parse(
                await file.text()
            );

            if (
                !imported ||
                !Array.isArray(imported.roster) ||
                !imported.days ||
                typeof imported.days !== "object"
            ) {
                throw new Error("ملف غير صالح");
            }

            const approved = confirm(
                "سيتم استبدال البيانات الحالية بالنسخة الاحتياطية. هل تريد المتابعة؟"
            );

            if (!approved) return;

            db = {
                roster: imported.roster.slice(0, DRIVER_COUNT),
                days: imported.days
            };

            while (db.roster.length < DRIVER_COUNT) {
                db.roster.push("");
            }

            ensureDay(activeDate);

            renderAll();

            $("statusMessage").textContent =
                "تم استيراد النسخة الاحتياطية بنجاح.";

        } catch (error) {
            alert(
                "تعذر استيراد الملف. تأكد أنه نسخة احتياطية صادرة من التطبيق."
            );
        }

        event.target.value = "";
    });


    /* =========================
       تجهيز الطباعة
    ========================= */

    window.printSection = function(sectionId, title) {
        const section = $(sectionId);

        if (!section) return;

        document.querySelectorAll(".printing-target")
            .forEach(element => {
                element.classList.remove("printing-target");
            });

        section.classList.add("printing-target");

        document.body.classList.add("printing");

        const oldTitle = document.title;

        document.title = title + " - " + activeDate;

        const replacements = [];

        section.querySelectorAll("input").forEach(input => {
            const span = document.createElement("span");

            span.className = "print-value";

            span.textContent = input.value || "—";

            span.style.display = "none";

            input.insertAdjacentElement("afterend", span);

            replacements.push(span);
        });

        const header = document.createElement("div");

        header.className = "print-header";

        header.innerHTML = `
            <div style="
                text-align:center;
                font-weight:bold;
                font-size:13px;
                margin-bottom:5px;
            ">
                حسابات التوصيل - ديرتي
            </div>

            <div style="font-size:9px;margin-bottom:5px">
                التاريخ: ${escapeHTML(activeDate)}
                ${currentDay().managerName
                    ? " • المسؤول: " +
                      escapeHTML(currentDay().managerName)
                    : ""}
            </div>
        `;

        section.prepend(header);

        header.style.display = "none";

        const cleanup = () => {
            document.body.classList.remove("printing");

            section.classList.remove("printing-target");

            header.remove();

            replacements.forEach(span => span.remove());

            document.title = oldTitle;

            window.removeEventListener("afterprint", cleanup);
        };

        window.addEventListener("afterprint", cleanup);

        window.print();

        // احتياط للمتصفحات التي لا تطلق afterprint بشكل صحيح.
        setTimeout(() => {
            if (document.body.classList.contains("printing")) {
                cleanup();
            }
        }, 2000);
    };


    /* =========================
       تثبيت التطبيق
    ========================= */

    window.addEventListener("beforeinstallprompt", event => {
        event.preventDefault();

        deferredInstallPrompt = event;

        $("installBtn").classList.remove("hidden");
    });

    $("installBtn").addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;

        deferredInstallPrompt.prompt();

        await deferredInstallPrompt.userChoice;

        deferredInstallPrompt = null;

        $("installBtn").classList.add("hidden");
    });


    /* =========================
       تشغيل التطبيق
    ========================= */

    ensureDay(activeDate);

    renderAll();

})();
