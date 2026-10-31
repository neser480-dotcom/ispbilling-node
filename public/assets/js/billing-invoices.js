
"use strict";

(function () {
    const API_URL = "/billing/data";

    const elements = {
        totalData: document.getElementById("totalData"),
        search: document.getElementById("invoiceSearch"),
        tableBody: document.getElementById("invoiceTableBody"),
        refresh: document.getElementById("refreshInvoices"),
        print: document.getElementById("printInvoices"),
        filter: document.getElementById("filterInvoices"),
        modal: document.getElementById("invoiceModal"),
        closeModal: document.getElementById("closeInvoiceModal"),
        printSingle: document.getElementById("printSingleInvoice")
    };

    const modalFields = {
        id: document.getElementById("viewInvoiceId"),
        customerId: document.getElementById("viewCustomerId"),
        customerName: document.getElementById("viewCustomerName"),
        username: document.getElementById("viewUsername"),
        type: document.getElementById("viewType"),
        messageType: document.getElementById("viewMessageType"),
        amount: document.getElementById("viewAmount"),
        status: document.getElementById("viewStatus")
    };

    let invoices = [];
    let filteredInvoices = [];
    let searchTimer = null;
    let activeInvoice = null;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (char) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[char];
        });
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return escapeHtml(value);
        }

        return date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function formatAmount(value) {
        const amount = Number(value);
        if (!Number.isFinite(amount)) return "0.00";

        return amount.toLocaleString("en-BD", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function statusClass(status) {
        const value = String(status || "").toLowerCase();

        if (value === "paid") return "paid";
        if (value === "cancelled" || value === "canceled") return "cancelled";

        return "unpaid";
    }

    function statusBadge(status) {
        const text = String(status || "unpaid");
        return `<span class="status-badge ${statusClass(text)}">${escapeHtml(text)}</span>`;
    }

    function getCustomerId(invoice) {
        return invoice.customer_id ?? invoice.user_id ?? "—";
    }

    function getCustomerName(invoice) {
        return invoice.user_name ?? invoice.name ?? "—";
    }

    function matchesSearch(invoice, query) {
        if (!query) return true;

        const searchable = [
            invoice.id,
            invoice.type,
            invoice.message_type,
            invoice.amount,
            invoice.status,
            invoice.user_id,
            invoice.customer_id,
            invoice.user_name,
            invoice.name,
            invoice.username,
            invoice.company_name
        ].join(" ").toLowerCase();

        return searchable.includes(query);
    }

    function render() {
        const query = String(elements.search?.value || "")
            .trim()
            .toLowerCase();

        filteredInvoices = invoices.filter(function (invoice) {
            return matchesSearch(invoice, query);
        });

        if (elements.totalData) {
            elements.totalData.textContent = filteredInvoices.length;
        }

        if (!elements.tableBody) return;

        if (!filteredInvoices.length) {
            elements.tableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center">
                        No invoices found.
                    </td>
                </tr>
            `;
            return;
        }

        elements.tableBody.innerHTML = filteredInvoices.map(function (invoice, index) {
            const id = Number(invoice.id);
            const customerId = getCustomerId(invoice);
            const customerName = getCustomerName(invoice);

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        <div class="invoice-customer-name">${escapeHtml(customerName)}</div>
                        <small>ID: ${escapeHtml(customerId)}</small>
                        ${invoice.username
                            ? `<br><small>PPPoE: ${escapeHtml(invoice.username)}</small>`
                            : ""}
                    </td>
                    <td>${escapeHtml(invoice.type || "—")}</td>
                    <td>${escapeHtml(invoice.message_type || "—")}</td>
                    <td>${escapeHtml(formatAmount(invoice.amount))}</td>
                    <td>${statusBadge(invoice.status)}</td>
                    <td>${formatDate(invoice.invoice_date)}</td>
                    <td>${formatDate(invoice.due_date)}</td>
                    <td>${formatDate(invoice.paid_date)}</td>
                    <td>
                        <div class="invoice-action-menu">
                            <button
                                type="button"
                                class="invoice-action-trigger"
                                data-action="toggle-menu"
                                aria-label="Invoice actions"
                                aria-expanded="false"
                            >&#8942;</button>
                            <div class="invoice-action-dropdown" hidden>
                                <button type="button" data-action="view" data-id="${id}">
                                    View
                                </button>
                                <button type="button" data-action="print-one" data-id="${id}">
                                    Print
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function loadInvoices() {
        if (elements.tableBody) {
            elements.tableBody.innerHTML = `
                <tr><td colspan="10" class="text-center">Loading invoices...</td></tr>
            `;
        }

        try {
            const response = await fetch(API_URL, {
                method: "GET",
                credentials: "same-origin",
                headers: { "Accept": "application/json" }
            });

            if (response.redirected) {
                window.location.href = response.url;
                return;
            }

            const data = await response.json();

            if (!response.ok || data.success !== true) {
                throw new Error(data.message || "Unable to load invoices.");
            }

            invoices = Array.isArray(data.rows) ? data.rows : [];
            render();
        } catch (error) {
            console.error("Invoice loading error:", error);

            if (elements.tableBody) {
                elements.tableBody.innerHTML = `
                    <tr>
                        <td colspan="10" class="text-center">
                            ${escapeHtml(error.message || "Unable to load invoices.")}
                        </td>
                    </tr>
                `;
            }

            if (elements.totalData) {
                elements.totalData.textContent = "0";
            }
        }
    }

    function closeMenus() {
        document.querySelectorAll(".invoice-action-dropdown").forEach(function (menu) {
            menu.hidden = true;
        });

        document.querySelectorAll(".invoice-action-trigger").forEach(function (button) {
            button.setAttribute("aria-expanded", "false");
        });
    }

    function openModal() {
        if (!elements.modal) return;

        elements.modal.hidden = false;
        elements.modal.classList.add("show");
        document.body.classList.add("invoice-modal-open");
    }

    function closeModal() {
        if (!elements.modal) return;

        elements.modal.classList.remove("show");
        elements.modal.hidden = true;
        document.body.classList.remove("invoice-modal-open");
    }

    function setField(element, value) {
        if (element) element.textContent = value == null || value === "" ? "—" : String(value);
    }

    async function viewInvoice(id) {
        try {
            const response = await fetch(`${API_URL}/${encodeURIComponent(id)}`, {
                method: "GET",
                credentials: "same-origin",
                headers: { "Accept": "application/json" }
            });

            if (response.redirected) {
                window.location.href = response.url;
                return;
            }

            const data = await response.json();

            if (!response.ok || data.success !== true || !data.invoice) {
                throw new Error(data.message || "Unable to load invoice details.");
            }

            activeInvoice = data.invoice;
            const invoice = activeInvoice;

            setField(modalFields.id, invoice.id);
            setField(modalFields.customerId, getCustomerId(invoice));
            setField(modalFields.customerName, getCustomerName(invoice));
            setField(modalFields.username, invoice.username);
            setField(modalFields.type, invoice.type);
            setField(modalFields.messageType, invoice.message_type);
            setField(modalFields.amount, formatAmount(invoice.amount));
            setField(modalFields.status, invoice.status);

            openModal();
        } catch (error) {
            console.error("Invoice detail error:", error);
            alert(error.message || "Unable to load invoice details.");
        }
    }

    function printInvoice(invoice) {
        if (!invoice) return;

        const content = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Invoice #${escapeHtml(invoice.id)}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 30px; color: #222; }
                    h2 { margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; }
                    td { padding: 10px; border: 1px solid #ddd; }
                    td:first-child { font-weight: bold; width: 35%; }
                    @media print { button { display: none; } }
                </style>
            </head>
            <body>
                <h2>Invoice #${escapeHtml(invoice.id)}</h2>
                <table>
                    <tr><td>Customer ID</td><td>${escapeHtml(getCustomerId(invoice))}</td></tr>
                    <tr><td>Customer</td><td>${escapeHtml(getCustomerName(invoice))}</td></tr>
                    <tr><td>Username</td><td>${escapeHtml(invoice.username || "—")}</td></tr>
                    <tr><td>Type</td><td>${escapeHtml(invoice.type || "—")}</td></tr>
                    <tr><td>Message Type</td><td>${escapeHtml(invoice.message_type || "—")}</td></tr>
                    <tr><td>Amount</td><td>${escapeHtml(formatAmount(invoice.amount))}</td></tr>
                    <tr><td>Status</td><td>${escapeHtml(invoice.status || "—")}</td></tr>
                    <tr><td>Invoice Date</td><td>${escapeHtml(formatDate(invoice.invoice_date))}</td></tr>
                    <tr><td>Due Date</td><td>${escapeHtml(formatDate(invoice.due_date))}</td></tr>
                    <tr><td>Paid Date</td><td>${escapeHtml(formatDate(invoice.paid_date))}</td></tr>
                </table>
                <script>window.onload = function () { window.print(); };</script>
            </body>
            </html>
        `;

        const printWindow = window.open("", "_blank", "width=800,height=700");

        if (!printWindow) {
            alert("Please allow pop-ups to print the invoice.");
            return;
        }

        printWindow.document.open();
        printWindow.document.write(content);
        printWindow.document.close();
    }

    if (elements.search) {
        elements.search.addEventListener("input", function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(render, 250);
        });
    }

    if (elements.refresh) {
        elements.refresh.addEventListener("click", loadInvoices);
    }

    if (elements.print) {
        elements.print.addEventListener("click", function () {
            window.print();
        });
    }

    if (elements.filter) {
        elements.filter.addEventListener("click", render);
    }

    if (elements.closeModal) {
        elements.closeModal.addEventListener("click", closeModal);
    }

    if (elements.printSingle) {
        elements.printSingle.addEventListener("click", function () {
            printInvoice(activeInvoice);
        });
    }

    if (elements.modal) {
        elements.modal.addEventListener("click", function (event) {
            if (event.target === elements.modal) closeModal();
        });
    }

    document.addEventListener("click", function (event) {
        const trigger = event.target.closest("[data-action='toggle-menu']");

        if (trigger) {
            const menu = trigger.parentElement.querySelector(".invoice-action-dropdown");
            const shouldOpen = menu && menu.hidden;

            closeMenus();

            if (menu && shouldOpen) {
                menu.hidden = false;
                trigger.setAttribute("aria-expanded", "true");
            }

            return;
        }

        const actionButton = event.target.closest("[data-action]");

        if (actionButton) {
            const id = actionButton.dataset.id;

            if (actionButton.dataset.action === "view") {
                closeMenus();
                viewInvoice(id);
                return;
            }

            if (actionButton.dataset.action === "print-one") {
                closeMenus();

                const invoice = invoices.find(function (item) {
                    return String(item.id) === String(id);
                });

                if (invoice) printInvoice(invoice);
                return;
            }
        }

        if (!event.target.closest(".invoice-action-menu")) {
            closeMenus();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeMenus();
            closeModal();
        }
    });

    const detailMatch = window.location.pathname.match(/^\/billing\/invoice\/(\d+)\/?$/);

    if (detailMatch) {
        viewInvoice(detailMatch[1]);
    } else {
        loadInvoices();
    }
})();