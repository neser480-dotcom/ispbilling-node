
"use strict";

(() => {
    const api = "/api/staff";

    const tableBody = document.getElementById("staffTableBody");
    const searchInput = document.getElementById("staffSearch");
    const totalData = document.getElementById("totalData");
    const csrfInput = document.getElementById("csrfTokenInput");

    let csrfToken = "";
    let searchTimer = null;
    let loadingStaff = false;

    /*
    |--------------------------------------------------------------------------
    | DOM HELPERS
    |--------------------------------------------------------------------------
    */

    function byId(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    function money(value) {
        const amount = Number(value || 0);

        return Number.isFinite(amount)
            ? amount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })
            : "0.00";
    }

    function getFormValues(form) {
        return Object.fromEntries(new FormData(form).entries());
    }

    function requireElement(id, description = id) {
        const element = byId(id);

        if (!element) {
            throw new Error(`${description} পাওয়া যায়নি। HTML-এর ID পরীক্ষা করুন।`);
        }

        return element;
    }

    /*
    |--------------------------------------------------------------------------
    | TOAST NOTIFICATION
    |--------------------------------------------------------------------------
    */

    function showMessage(message, type = "success") {
        let container = byId("employeeToastContainer");

        if (!container) {
            container = document.createElement("div");
            container.id = "employeeToastContainer";
            container.setAttribute("aria-live", "polite");
            container.setAttribute("aria-atomic", "false");
            document.body.appendChild(container);
        }

        const normalizedType = {
            danger: "error",
            error: "error",
            success: "success",
            warning: "warning",
            info: "info"
        }[type] || "info";

        const icons = {
            success: "fa-circle-check",
            error: "fa-circle-xmark",
            warning: "fa-triangle-exclamation",
            info: "fa-circle-info"
        };

        const toast = document.createElement("div");
        toast.className = `employee-toast ${normalizedType}`;

        const icon = document.createElement("span");
        icon.className = "toast-icon";

        const iconElement = document.createElement("i");
        iconElement.className = `fa-solid ${icons[normalizedType]}`;
        icon.appendChild(iconElement);

        const text = document.createElement("div");
        text.className = "toast-message";
        text.textContent = String(message || "কাজ সম্পন্ন হয়েছে।");

        const close = document.createElement("button");
        close.type = "button";
        close.className = "toast-close";
        close.textContent = "\u00D7";
        close.setAttribute("aria-label", "Close notification");

        toast.append(icon, text, close);
        container.appendChild(toast);

        let timer = null;
        let removeTimer = null;
        let dismissed = false;

        function dismiss() {
            if (dismissed) return;
            dismissed = true;

            clearTimeout(timer);

            if (!toast.isConnected) return;

            toast.classList.add("toast-hide");

            // CSS animation না চললেও Toast সরানো হবে।
            removeTimer = setTimeout(() => {
                toast.remove();
            }, 350);
        }

        close.addEventListener("click", dismiss);

        toast.addEventListener("animationend", event => {
            if (
                event.target === toast &&
                toast.classList.contains("toast-hide")
            ) {
                clearTimeout(removeTimer);
                toast.remove();
            }
        });

        timer = setTimeout(dismiss, 4000);
    }

    /*
    |--------------------------------------------------------------------------
    | CSRF
    |--------------------------------------------------------------------------
    */

    async function loadCsrf() {
        const response = await fetch("/api/csrf-token", {
            credentials: "same-origin",
            headers: {
                Accept: "application/json"
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success || !data.csrf_token) {
            throw new Error(
                data.message || "CSRF token পাওয়া যায়নি। পেজ রিফ্রেশ করুন।"
            );
        }

        csrfToken = data.csrf_token;

        // Hidden input থাকলে সেটি আপডেট হবে; না থাকলেও JS crash করবে না।
        if (csrfInput) {
            csrfInput.value = csrfToken;
        }

        document
            .querySelector('meta[name="csrf-token"]')
            ?.setAttribute("content", csrfToken);
    }

    /*
    |--------------------------------------------------------------------------
    | API REQUEST
    |--------------------------------------------------------------------------
    */

    async function request(url, options = {}) {
        const method = String(options.method || "GET").toUpperCase();
        const headers = {
            Accept: "application/json",
            ...(options.headers || {})
        };

        if (method !== "GET" && method !== "HEAD") {
            if (!csrfToken) {
                await loadCsrf();
            }

            headers["X-CSRF-Token"] = csrfToken;
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(url, {
            ...options,
            method,
            credentials: "same-origin",
            headers
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
            if (response.status === 403) {
                throw new Error(
                    data.message || "অনুমতি পাওয়া যায়নি অথবা CSRF token ভুল।"
                );
            }

            throw new Error(
                data.message ||
                `Request ব্যর্থ হয়েছে (HTTP ${response.status})।`
            );
        }

        return data;
    }

    /*
    |--------------------------------------------------------------------------
    | BOOTSTRAP MODAL HELPER
    |--------------------------------------------------------------------------
    */

    function hideModal(id) {
        const modalElement = byId(id);

        if (!modalElement) {
            throw new Error(`Modal পাওয়া যায়নি: ${id}`);
        }

        if (!window.bootstrap?.Modal) {
            throw new Error("Bootstrap Modal লোড হয়নি।");
        }

        window.bootstrap.Modal
            .getOrCreateInstance(modalElement)
            .hide();
    }

    /*
    |--------------------------------------------------------------------------
    | LOAD STAFF
    |--------------------------------------------------------------------------
    */

    async function loadStaff() {
        if (!tableBody || !searchInput || !totalData) {
            showMessage(
                "Staff table-এর প্রয়োজনীয় HTML element পাওয়া যায়নি।",
                "error"
            );
            return;
        }

        if (loadingStaff) return;

        loadingStaff = true;

        tableBody.innerHTML =
            '<tr><td colspan="7" class="text-center">Loading...</td></tr>';

        try {
            const query = new URLSearchParams();
            const search = searchInput.value.trim();

            if (search) {
                query.set("search", search);
            }

            const data = await request(
                `${api}/data?${query.toString()}`
            );

            const rows = Array.isArray(data.staff)
                ? data.staff
                : [];

            totalData.textContent = data.totalData ?? rows.length;

            if (!rows.length) {
                tableBody.innerHTML =
                    '<tr><td colspan="7" class="text-center">No records found.</td></tr>';
                return;
            }

            tableBody.innerHTML = rows.map((staff, index) => {
                const rowJson = escapeHtml(JSON.stringify(staff));

                const status = String(staff.status || "active");
                const statusClass =
                    status.toLowerCase() === "active"
                        ? "bg-success"
                        : "bg-secondary";

                const staffId = Number(staff.id) || 0;

                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${escapeHtml(staff.name)}</td>
                        <td>${escapeHtml(staff.mobile)}</td>
                        <td>
                            <span class="badge ${statusClass}">
                                ${escapeHtml(status)}
                            </span>
                        </td>
                        <td>${money(staff.salary)}</td>
                        <td>${money(staff.due)}</td>
                        <td>
                            <div class="dropdown">
                                <button
                                    type="button"
                                    class="btn btn-sm btn-light border dropdown-toggle"
                                    data-bs-toggle="dropdown"
                                    aria-expanded="false">
                                    Action
                                </button>

                                <ul class="dropdown-menu dropdown-menu-end">
                                    <li>
                                        <button
                                            type="button"
                                            class="dropdown-item editStaffButton"
                                            data-row="${rowJson}"
                                            data-bs-toggle="modal"
                                            data-bs-target="#editStaffModal">
                                            <i class="fa-solid fa-pen-to-square me-2"></i>
                                            Edit
                                        </button>
                                    </li>

                                    <li>
                                        <a
                                            class="dropdown-item"
                                            href="/staff/salary?id=${encodeURIComponent(staffId)}">
                                            <i class="fa-solid fa-dollar-sign me-2"></i>
                                            Salary
                                        </a>
                                    </li>

                                    <li>
                                        <button
                                            type="button"
                                            class="dropdown-item smsStaffButton"
                                            data-id="${staffId}"
                                            data-name="${escapeHtml(staff.name)}"
                                            data-bs-toggle="modal"
                                            data-bs-target="#smsModal">
                                            <i class="fa-solid fa-comment-sms me-2"></i>
                                            Message
                                        </button>
                                    </li>

                                    <li>
                                        <button
                                            type="button"
                                            class="dropdown-item text-danger deleteStaffButton"
                                            data-id="${staffId}"
                                            data-name="${escapeHtml(staff.name)}">
                                            <i class="fa-solid fa-trash me-2"></i>
                                            Delete
                                        </button>
                                    </li>
                                </ul>
                            </div>
                        </td>
                    </tr>
                `;
            }).join("");

        } catch (error) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-danger">
                        ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;
        } finally {
            loadingStaff = false;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | FORM SUBMISSION HELPER
    |--------------------------------------------------------------------------
    */

    function bindSubmit(formId, handler) {
        const form = byId(formId);

        if (!form) {
            console.error(
                `[Employee] Form not found: #${formId}`
            );
            return;
        }

        form.addEventListener("submit", async event => {
            event.preventDefault();

            // গুরুত্বপূর্ণ: await-এর আগে form reference ধরে রাখা হচ্ছে।
            const submittedForm = event.currentTarget;

            if (!(submittedForm instanceof HTMLFormElement)) {
                showMessage("Form সঠিকভাবে পাওয়া যায়নি।", "error");
                return;
            }

            const submitButtons = Array.from(
                submittedForm.querySelectorAll(
                    'button[type="submit"], input[type="submit"]'
                )
            );

            const previousStates = submitButtons.map(button => ({
                button,
                disabled: button.disabled
            }));

            submitButtons.forEach(button => {
                button.disabled = true;
            });

            try {
                await handler(submittedForm);
            } catch (error) {
                showMessage(
                    error?.message || "অনুরোধ সম্পন্ন করা যায়নি।",
                    "error"
                );
            } finally {
                previousStates.forEach(({ button, disabled }) => {
                    if (button.isConnected) {
                        button.disabled = disabled;
                    }
                });
            }
        });
    }

    /*
    |--------------------------------------------------------------------------
    | ADD STAFF
    |--------------------------------------------------------------------------
    */

    bindSubmit("addStaffForm", async form => {
        const values = getFormValues(form);

        const data = await request(api, {
            method: "POST",
            body: JSON.stringify(values)
        });

        // API success হওয়ার পরেই modal বন্ধ ও form reset হবে।
        hideModal("addStaffModal");

        // এখানে form null হওয়ার সুযোগ নেই; আগে reference নেওয়া হয়েছে।
        form.reset();

        showMessage(
            data.message || "স্টাফ সফলভাবে যোগ হয়েছে।",
            "success"
        );

        await loadStaff();
    });

    /*
    |--------------------------------------------------------------------------
    | EDIT STAFF
    |--------------------------------------------------------------------------
    */

    bindSubmit("editStaffForm", async form => {
        const values = getFormValues(form);

        if (!values.id) {
            throw new Error("Staff ID পাওয়া যায়নি।");
        }

        const data = await request(
            `${api}/${encodeURIComponent(values.id)}`,
            {
                method: "PUT",
                body: JSON.stringify(values)
            }
        );

        hideModal("editStaffModal");

        showMessage(
            data.message || "স্টাফের তথ্য আপডেট হয়েছে।",
            "success"
        );

        await loadStaff();
    });

    /*
    |--------------------------------------------------------------------------
    | SMS / STAFF MESSAGE
    |--------------------------------------------------------------------------
    */

    bindSubmit("smsForm", async form => {
        const values = getFormValues(form);

        const data = await request(`${api}/sms`, {
            method: "POST",
            body: JSON.stringify(values)
        });

        hideModal("smsModal");

        showMessage(
            data.message || "মেসেজের অনুরোধ সম্পন্ন হয়েছে।",
            "success"
        );

        form.reset();
        updateSmsCount();
    });

    /*
    |--------------------------------------------------------------------------
    | PRINT
    |--------------------------------------------------------------------------
    */

    byId("printStaff")?.addEventListener("click", () => {
        window.print();
    });

    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    searchInput?.addEventListener("input", () => {
        clearTimeout(searchTimer);

        searchTimer = setTimeout(() => {
            loadStaff();
        }, 300);
    });

    /*
    |--------------------------------------------------------------------------
    | TABLE ACTIONS
    |--------------------------------------------------------------------------
    */

    tableBody?.addEventListener("click", async event => {
        const target = event.target;

        if (!(target instanceof Element)) return;

        const editButton = target.closest(".editStaffButton");

        if (editButton) {
            try {
                const staff = JSON.parse(
                    editButton.dataset.row || "{}"
                );

                const fields = {
                    edit_id: staff.id ?? "",
                    edit_name: staff.name ?? "",
                    edit_mobile: staff.mobile ?? "",
                    edit_salary: staff.salary ?? 0,
                    edit_address: staff.address ?? "",
                    edit_status: staff.status ?? "active"
                };

                for (const [id, value] of Object.entries(fields)) {
                    const field = byId(id);

                    if (field) {
                        field.value = value;
                    } else {
                        console.error(
                            `[Employee] Edit field not found: #${id}`
                        );
                    }
                }
            } catch (error) {
                showMessage(
                    "স্টাফের তথ্য Edit form-এ বসানো যায়নি।",
                    "error"
                );
                console.error("[Employee] Edit error:", error);
            }

            return;
        }

        const smsButton = target.closest(".smsStaffButton");

        if (smsButton) {
            const idField = byId("sms_staff_id");
            const nameField = byId("sms_staff_name");
            const messageField = byId("sms_text_box");

            if (idField) {
                idField.value = smsButton.dataset.id || "";
            }

            if (nameField) {
                nameField.textContent =
                    smsButton.dataset.name || "STAFF";
            }

            if (messageField) {
                messageField.value = "";
            }

            updateSmsCount();
            return;
        }

        const deleteButton = target.closest(".deleteStaffButton");

        if (!deleteButton) return;

        const staffId = deleteButton.dataset.id;

        if (!staffId) {
            showMessage("Staff ID পাওয়া যায়নি।", "error");
            return;
        }

        const staffName = deleteButton.dataset.name || "এই স্টাফ";

        if (!window.confirm(
            `আপনি কি নিশ্চিত "${staffName}"-কে ডিলিট করতে চান?`
        )) {
            return;
        }

        deleteButton.disabled = true;

        try {
            const data = await request(
                `${api}/${encodeURIComponent(staffId)}`,
                {
                    method: "DELETE"
                }
            );

            showMessage(
                data.message || "স্টাফ ডিলিট হয়েছে।",
                "success"
            );

            await loadStaff();

        } catch (error) {
            showMessage(
                error.message || "স্টাফ ডিলিট করা যায়নি।",
                "error"
            );
        } finally {
            if (deleteButton.isConnected) {
                deleteButton.disabled = false;
            }
        }
    });

    /*
    |--------------------------------------------------------------------------
    | SMS CHARACTER / SEGMENT COUNT
    |--------------------------------------------------------------------------
    */

    function updateSmsCount() {
        const messageField = byId("sms_text_box");
        const letterCount = byId("letter_count");
        const smsCount = byId("sms_count");

        if (!messageField) return;

        const message = messageField.value;
        const isAscii = /^[\x00-\x7F]*$/.test(message);

        if (letterCount) {
            letterCount.textContent = message.length;
        }

        if (smsCount) {
            smsCount.textContent = message.length
                ? Math.ceil(message.length / (isAscii ? 160 : 70))
                : 0;
        }
    }

    byId("sms_text_box")?.addEventListener(
        "input",
        updateSmsCount
    );

    /*
    |--------------------------------------------------------------------------
    | INITIALIZATION
    |--------------------------------------------------------------------------
    */

    async function init() {
        if (!tableBody) {
            console.error(
                "[Employee] #staffTableBody পাওয়া যায়নি।"
            );
            showMessage("Staff table HTML পাওয়া যায়নি।", "error");
            return;
        }

        try {
            await loadCsrf();
            await loadStaff();
        } catch (error) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-danger">
                        ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;

            showMessage(
                error.message || "Staff page চালু করা যায়নি।",
                "error"
            );
        }
    }

    init();
})();
