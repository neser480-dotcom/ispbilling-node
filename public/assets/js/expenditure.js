
"use strict";

(() => {
    const base = "/accounts/expenditure";
    const $ = id => document.getElementById(id);

    let csrfToken = "";
    let expenditures = [];
    let types = [];
    let sortKey = "serial_no";
    let sortDirection = 1;

    const escapeHtml = value =>
        String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char]));

    const money = value => new Intl.NumberFormat("en-BD", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(Number(value) || 0);

    const dateText = value => {
        if (!value) return "";

        const date = new Date(String(value).replace(" ", "T"));

        if (Number.isNaN(date.getTime())) return String(value);
        const p = n => String(n).padStart(2, "0");
        let hr = date.getHours();
        const ampm = hr >= 12 ? "PM" : "AM";
        hr = hr % 12 || 12;
        return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(hr)}:${p(date.getMinutes())} ${ampm}`;
    };

    async function getCsrfToken() {
        try {
            const response = await fetch("/api/csrf-token", {
                credentials: "same-origin",
                headers: {
                    Accept: "application/json"
                }
            });

            const data = await response.json();

            csrfToken = data.csrf_token || data.token || "";
        } catch (error) {
            console.error("Unable to get CSRF token.", error);
        }

        return csrfToken;
    }

    async function api(url, options = {}) {
        const method = (options.method || "GET").toUpperCase();

        const headers = {
            Accept: "application/json",
            ...(options.headers || {})
        };

        if (options.body) {
            headers["Content-Type"] = "application/json";
        }

        if (method !== "GET") {
            if (!csrfToken) {
                await getCsrfToken();
            }

            if (csrfToken) {
                headers["X-CSRF-Token"] = csrfToken;
            }
        }

        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            method,
            headers
        });

        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            location.href = "/";
            throw new Error("Session expired. Please log in again.");
        }

        if (response.status === 402 && data.redirect) {
            location.href = data.redirect;
            throw new Error("Payment required.");
        }

        if (!response.ok || data.success === false) {
            throw new Error(
                data.message || `Request failed (${response.status})`
            );
        }

        return data;
    }

    function setStatus(message, success = false) {
        const status = $("statusMessage");

        if (!status) return;

        status.textContent = message || "";
        status.className = success ? "success" : "";
    }

    function renderTypeOptions() {
        const filterType = $("filterType");
        const entryType = $("entryType");

        if (filterType) {
            const selected = filterType.value;

            filterType.innerHTML =
                '<option value="">All Types</option>' +
                types.map(type => `
                    <option value="${escapeHtml(type.type_name)}">
                        ${escapeHtml(type.type_name)}
                    </option>
                `).join("");

            filterType.value = selected;
        }

        if (entryType) {
            const selected = entryType.value;

            entryType.innerHTML =
                '<option value="">Select Expenditure Type</option>' +
                types.map(type => `
                    <option value="${escapeHtml(type.id)}">
                        ${escapeHtml(type.type_name)}
                    </option>
                `).join("");

            if (selected) {
                entryType.value = selected;
            }
        }
    }

    function getVisibleExpenditures() {
        const search = ($("tableSearch")?.value || "")
            .trim()
            .toLowerCase();

        return expenditures
            .filter(row => {
                if (!search) return true;

                return [
                    row.serial_no,
                    row.expenditure_type,
                    row.expense_definition,
                    row.name,
                    row.user_role,
                    row.amount,
                    row.created_at
                ].some(value =>
                    String(value ?? "").toLowerCase().includes(search)
                );
            })
            .sort((a, b) => {
                let x = a[sortKey];
                let y = b[sortKey];

                if (["amount", "serial_no", "id"].includes(sortKey)) {
                    x = Number(x) || 0;
                    y = Number(y) || 0;
                } else {
                    x = String(x ?? "").toLowerCase();
                    y = String(y ?? "").toLowerCase();
                }

                return (x < y ? -1 : x > y ? 1 : 0) * sortDirection;
            });
    }

    function renderExpenditures() {
        const tbody = $("expenditureRows");

        if (!tbody) return;

        const rows = getVisibleExpenditures();

        tbody.innerHTML = rows.length
            ? rows.map(row => `
                <tr>
                    <td>${escapeHtml(row.serial_no ?? "")}</td>
                    <td><span class="ex-badge ex-b-cyan">${escapeHtml(row.expenditure_type ?? "")}</span></td>
                    <td class="ex-desc">${escapeHtml(row.expense_definition ?? "")}</td>
                    <td>
                        <div class="ex-name">${escapeHtml(row.name ?? "")}</div>
                        ${row.user_role ? `<span class="ex-badge ex-b-blue">${escapeHtml(row.user_role)}</span>` : ""}
                    </td>
                    <td class="amount">${money(row.amount)} Tk</td>
                    <td>${escapeHtml(dateText(row.created_at))}</td>
                    <td>
                        <div class="action-wrap">
                            <button
                                type="button"
                                class="action-btn"
                                aria-label="Expenditure actions"
                                aria-haspopup="true"
                                onclick="this.nextElementSibling.classList.toggle('show')"
                            >&#8942;</button>

                            <div class="action-menu">
                                <button
                                    type="button"
                                    data-edit-exp="${escapeHtml(row.id)}"
                                >Edit</button>

                                <button
                                    type="button"
                                    class="delete-item"
                                    data-delete-exp="${escapeHtml(row.id)}"
                                >Delete</button>
                            </div>
                        </div>
                    </td>
                </tr>
            `).join("")
            : '<tr><td colspan="7" class="empty">No expenditure records found.</td></tr>';

        const totalRows = $("totalRows");
        const totalAmount = $("totalAmount");

        if (totalRows) {
            totalRows.textContent = rows.length;
        }

        if (totalAmount) {
            totalAmount.textContent = money(
                rows.reduce(
                    (sum, row) => sum + (Number(row.amount) || 0),
                    0
                )
            );
        }
    }

    function renderTypes() {
        const tbody = $("typeRows");

        if (!tbody) return;

        const totalTypes = $("totalTypes");

        if (totalTypes) {
            totalTypes.textContent = types.length;
        }

        tbody.innerHTML = types.length
            ? types.map((type, index) => `
                <tr>
                    <td>${escapeHtml(type.serial_no ?? index + 1)}</td>
                    <td>${escapeHtml(type.type_name ?? "")}</td>
                    <td>${escapeHtml(dateText(type.created_at))}</td>
                    <td>
                        <div class="action-wrap">
                            <button
                                type="button"
                                class="action-btn"
                                aria-label="Expenditure type actions"
                                aria-haspopup="true"
                                onclick="this.nextElementSibling.classList.toggle('show')"
                            >&#8942;</button>

                            <div class="action-menu">
                                <button
                                    type="button"
                                    data-edit-type="${escapeHtml(type.id)}"
                                >Edit</button>

                                <button
                                    type="button"
                                    class="delete-item"
                                    data-delete-type="${escapeHtml(type.id)}"
                                >Delete</button>
                            </div>
                        </div>
                    </td>
                </tr>
            `).join("")
            : '<tr><td colspan="4" class="empty">No expenditure types found.</td></tr>';
    }

    async function loadData() {
        setStatus("Loading...");

        const params = new URLSearchParams();

        const name = $("filterName")?.value.trim() || "";
        const type = $("filterType")?.value || "";
        const from = $("dateFrom")?.value || "";
        const to = $("dateTo")?.value || "";

        if (name) params.set("name", name);
        if (type) params.set("type", type);
        if (from) params.set("date_from", from);
        if (to) params.set("date_to", to);

        if (from || to) {
            params.set("filter", "1");
        }

        try {
            const data = await api(
                `${base}/api/data?${params.toString()}`
            );

            expenditures = Array.isArray(data.expenditures)
                ? data.expenditures
                : [];

            types = Array.isArray(data.types)
                ? data.types
                : [];

            renderTypeOptions();
            renderExpenditures();
            renderTypes();

            setStatus("");
        } catch (error) {
            setStatus(error.message);

            const tbody = $("expenditureRows");

            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="empty">
                            ${escapeHtml(error.message)}
                        </td>
                    </tr>
                `;
            }
        }
    }

    function openModal(kind, row = null) {
        const isType = kind === "type";
        const form = $("entryForm");

        form.reset();

        $("entryKind").value = kind;
        $("entryId").value = row?.id ?? "";

        $("expenditureFields").hidden = isType;
        $("typeFields").hidden = !isType;

        $("entryType").required = !isType;
        $("entryDefinition").required = false;
        $("entryName").required = !isType;
        $("entryAmount").required = !isType;
        $("typeName").required = isType;

        $("modalTitle").textContent =
            `${row ? "Edit" : "Add"} ${
                isType ? "Expenditure Type" : "Expenditure"
            }`;

        $("saveBtn").textContent = row ? "Update" : "Save";

        if (isType) {
            $("typeName").value = row?.type_name ?? "";
        } else if (row) {
            $("entryDefinition").value = row.expense_definition ?? "";
            $("entryName").value = row.name ?? "";
            $("entryAmount").value = row.amount ?? "";

            const selectedType = types.find(type =>
                String(type.id) === String(
                    row.type_id ?? row.expenditure_type_id
                )
            ) || types.find(type =>
                type.type_name === row.expenditure_type
            );

            $("entryType").value = selectedType
                ? String(selectedType.id)
                : "";
        }

        const backdrop = $("modalBackdrop");

        backdrop.hidden = false;
        backdrop.classList.add("show");
    }

    function closeModal() {
        const backdrop = $("modalBackdrop");

        backdrop.classList.remove("show");
        backdrop.hidden = true;
    }

    async function submitEntry(event) {
        event.preventDefault();

        const kind = $("entryKind").value;
        const id = $("entryId").value;
        const isType = kind === "type";

        const body = isType
            ? {
                type_name: $("typeName").value.trim()
            }
            : {
                type_id: $("entryType").value,
                expenditure_type_id: $("entryType").value,
                expense_definition: $("entryDefinition").value.trim(),
                name: $("entryName").value.trim(),
                amount: $("entryAmount").value
            };

        if (isType && !body.type_name) {
            alert("Please enter an expenditure type.");
            return;
        }

        if (
            !isType &&
            (!body.type_id || !body.name || body.amount === "")
        ) {
            alert("Please fill in all required expenditure fields.");
            return;
        }

        const endpoint = isType ? "types" : "expenditures";

        const url = `${base}/api/${endpoint}${
            id ? `/${encodeURIComponent(id)}` : ""
        }`;

        $("saveBtn").disabled = true;

        try {
            const result = await api(url, {
                method: id ? "PUT" : "POST",
                body: JSON.stringify(body)
            });

            closeModal();

            await loadData();

            setStatus(result.message || "Saved successfully.", true);
        } catch (error) {
            setStatus(error.message);
            alert(error.message);
        } finally {
            $("saveBtn").disabled = false;
        }
    }

    async function deleteItem(kind, id) {
        const label = kind === "type"
            ? "this expenditure type"
            : "this expenditure";

        if (!confirm(`Are you sure you want to delete ${label}?`)) {
            return;
        }

        const endpoint = kind === "type" ? "types" : "expenditures";

        try {
            const result = await api(
                `${base}/api/${endpoint}/${encodeURIComponent(id)}`,
                { method: "DELETE" }
            );

            await loadData();

            setStatus(result.message || "Deleted successfully.", true);
        } catch (error) {
            setStatus(error.message);
            alert(error.message);
        }
    }

    // Tab switching: one Add button for both tabs
    document.querySelectorAll(".tab-btn[data-tab]").forEach(button => {
        button.addEventListener("click", () => {
            const tab = button.dataset.tab;
            const isExpenditure = tab === "expenditures";

            document.querySelectorAll(".tab-btn[data-tab]").forEach(item => {
                item.classList.toggle("active", item === button);
            });

            $("expenditurePanel").hidden = !isExpenditure;
            $("typePanel").hidden = isExpenditure;

            // Keep the top Add button visible on both tabs
            $("addBtn").hidden = false;
        });
    });

    // Filter toggle
    window.toggleFilter = function () {
        const filterBox = $("filterBox");

        if (filterBox) {
            filterBox.classList.toggle("show");
        }
    };

    // Refresh
    $("refreshBtn").addEventListener("click", loadData);

    // Print
    $("printBtn").addEventListener("click", () => window.print());

    // One Add button for Expenditure and Expenditure Types
    $("addBtn").addEventListener("click", () => {
        const typePanel = $("typePanel");
        const isTypeTab = typePanel && !typePanel.hidden;

        if (isTypeTab) {
            openModal("type");
            return;
        }

        if (!types.length) {
            alert("Add an expenditure type first.");
            return;
        }

        openModal("expenditure");
    });

    // Modal controls
    $("modalClose").addEventListener("click", closeModal);
    $("modalCancel").addEventListener("click", closeModal);

    $("modalBackdrop").addEventListener("click", event => {
        if (event.target === $("modalBackdrop")) {
            closeModal();
        }
    });

    // Form submit
    $("entryForm").addEventListener("submit", submitEntry);

    // Apply filters
    $("filterForm").addEventListener("submit", event => {
        event.preventDefault();
        loadData();
    });

    // Clear filters
    $("clearFilterBtn").addEventListener("click", () => {
        $("filterName").value = "";
        $("filterType").value = "";
        $("dateFrom").value = "";
        $("dateTo").value = "";

        loadData();
    });

    // Table search
    $("tableSearch").addEventListener("input", renderExpenditures);

    // Table sorting
    $("expenditureTable").querySelectorAll("th[data-sort]").forEach(th => {
        th.classList.add("sortable");

        th.addEventListener("click", () => {
            const key = th.dataset.sort;

            if (sortKey === key) {
                sortDirection *= -1;
            } else {
                sortKey = key;
                sortDirection = 1;
            }

            updateSortHeaders();
            renderExpenditures();
        });
    });

    function updateSortHeaders() {
        $("expenditureTable").querySelectorAll("th[data-sort]").forEach(th => {
            th.classList.remove("sort-asc", "sort-desc");
            if (th.dataset.sort === sortKey) {
                th.classList.add(sortDirection === 1 ? "sort-asc" : "sort-desc");
            }
        });
    }

    // Edit and Delete actions
    document.addEventListener("click", event => {
        const target = event.target;

        if (!(target instanceof Element)) return;

        const editExp = target.closest("[data-edit-exp]");
        const deleteExp = target.closest("[data-delete-exp]");
        const editType = target.closest("[data-edit-type]");
        const deleteType = target.closest("[data-delete-type]");

        if (editExp) {
            const row = expenditures.find(item =>
                String(item.id) === editExp.dataset.editExp
            );

            if (row) {
                openModal("expenditure", row);
            }
        } else if (deleteExp) {
            deleteItem("expenditure", deleteExp.dataset.deleteExp);
        } else if (editType) {
            const row = types.find(item =>
                String(item.id) === editType.dataset.editType
            );

            if (row) {
                openModal("type", row);
            }
        } else if (deleteType) {
            deleteItem("type", deleteType.dataset.deleteType);
        }

        if (!target.closest(".action-wrap")) {
            document.querySelectorAll(".action-menu.show").forEach(menu => {
                menu.classList.remove("show");
            });
        }
    });

    // Load CSRF token and initial data
    getCsrfToken().finally(loadData);
})();
