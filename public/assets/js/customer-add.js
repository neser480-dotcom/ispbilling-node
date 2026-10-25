
"use strict";

(function () {
    const API = "/api/customers/add";

    let initializedForm = null;
    let loading = false;

    function getForm() {
        return document.querySelector(
            "#customerActionModalBody #addNewCustomerForm"
        );
    }

    function field(form, name) {
        return form.querySelector(`[name="${name}"]`);
    }

    function value(form, name) {
        return String(field(form, name)?.value || "").trim();
    }

    async function request(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.body instanceof FormData
                    ? {}
                    : { "Content-Type": "application/json" }),
                ...(options.headers || {})
            }
        });

        const result = await response.json().catch(() => ({
            success: false,
            message: "Server returned an invalid response."
        }));

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || `Request failed (${response.status}).`
            );
        }

        return result;
    }

    function setOptions(select, rows, placeholder, getId, getName) {
        if (!select) return;

        select.replaceChildren(new Option(placeholder, ""));

        (Array.isArray(rows) ? rows : []).forEach((row) => {
            select.add(new Option(getName(row), String(getId(row))));
        });

        select.disabled = !rows || rows.length === 0;
    }

    async function loadCsrf(form) {
        const result = await request(`${API}/form`);

        const token = String(result.csrf_token || "");

        if (!token) {
            throw new Error("CSRF token পাওয়া যায়নি। পেজটি refresh করুন।");
        }

        const csrf = field(form, "csrf_token");

        if (csrf) csrf.value = token;

        const routerSelect = field(form, "mikrotik_id");

        setOptions(
            routerSelect,
            result.mikrotiks || [],
            "Select MikroTik",
            (row) => row.id,
            (row) => row.name
        );

        return token;
    }

    async function loadRouters(form) {
        const result = await request(`${API}/mikrotiks`);

        setOptions(
            field(form, "mikrotik_id"),
            result.data || [],
            "Select MikroTik",
            (row) => row.id,
            (row) => row.name
        );
    }

    async function loadPackages(form, routerId) {
        const select = field(form, "package_id");
        const fee = field(form, "monthly_fee");

        setOptions(select, [], "Select Package", (row) => row.id, (row) => row.package_name);

        if (fee) fee.value = "";

        if (!routerId) return;

        const result = await request(
            `${API}/packages?router_id=${encodeURIComponent(routerId)}`
        );

        setOptions(
            select,
            result.packages || [],
            "Select Package",
            (row) => row.id,
            (row) => {
                const name = row.alias_name || row.package_name;
                return `${name} - ${Number(row.price || 0).toFixed(2)}`;
            }
        );

        select.disabled = !(result.packages || []).length;
    }

    async function loadAreas(form, routerId) {
        const select = field(form, "area_id");

        setOptions(select, [], "Select Area", (row) => row.id, (row) => row.name);
        setOptions(
            field(form, "sub_area_id"),
            [],
            "Select Sub-Area",
            (row) => row.id,
            (row) => row.name
        );

        if (!routerId) return;

        const result = await request(
            `${API}/areas?mikrotik_id=${encodeURIComponent(routerId)}`
        );

        setOptions(
            select,
            result.data || [],
            "Select Area",
            (row) => row.id,
            (row) => row.name
        );
    }

    async function loadSubAreas(form, areaId) {
        const select = field(form, "sub_area_id");

        setOptions(select, [], "Select Sub-Area", (row) => row.id, (row) => row.name);

        if (!areaId) return;

        const result = await request(
            `${API}/sub-areas?area_id=${encodeURIComponent(areaId)}`
        );

        setOptions(
            select,
            result.data || [],
            "Select Sub-Area",
            (row) => row.id,
            (row) => row.name
        );
    }
async function loadDivisions(form) {
    const result = await request(`${API}/divisions`);

    setOptions(
        field(form, "division_id"),
        result.data || [],
        "Select Division",
        (row) => row.id,
        (row) => row.name
    );
}

async function loadDistricts(form, divisionId) {
    const districtSelect = field(form, "district_id");
    const upazilaSelect = field(form, "upazila_id");

    setOptions(
        districtSelect,
        [],
        "Select District",
        (row) => row.id,
        (row) => row.name
    );

    setOptions(
        upazilaSelect,
        [],
        "Select Upazila / Thana",
        (row) => row.id,
        (row) => row.name
    );

    if (!divisionId) return;

    const result = await request(
        `${API}/districts?division_id=${encodeURIComponent(divisionId)}`
    );

    setOptions(
        districtSelect,
        result.data || [],
        "Select District",
        (row) => row.id,
        (row) => row.name
    );
}

async function loadUpazilas(form, districtId) {
    const select = field(form, "upazila_id");

    setOptions(
        select,
        [],
        "Select Upazila / Thana",
        (row) => row.id,
        (row) => row.name
    );

    if (!districtId) return;

    const result = await request(
        `${API}/upazilas?district_id=${encodeURIComponent(districtId)}`
    );

    setOptions(
        select,
        result.data || [],
        "Select Upazila / Thana",
        (row) => row.id,
        (row) => row.name
    );
}
    function showError(message) {
        if (window.Swal) {
            window.Swal.fire({
                icon: "error",
                title: "Unable to continue",
                text: message
            });
        } else {
            window.alert(message);
        }
    }

    function showSuccess(message) {
        if (window.Swal) {
            return window.Swal.fire({
                icon: "success",
                title: "Success",
                text: message,
                timer: 1400,
                showConfirmButton: false
            });
        }

        window.alert(message);
        return Promise.resolve();
    }

    async function initialize() {
        const form = getForm();

        if (!form || initializedForm === form) return;

        initializedForm = form;

        form.addEventListener("submit", submitForm);

        field(form, "mikrotik_id")?.addEventListener("change", async () => {
            try {
                await Promise.all([
                    loadPackages(form, value(form, "mikrotik_id")),
                    loadAreas(form, value(form, "mikrotik_id"))
                ]);
            } catch (error) {
                showError(error.message);
            }
        });

        field(form, "area_id")?.addEventListener("change", async () => {
            try {
                await loadSubAreas(form, value(form, "area_id"));
            } catch (error) {
                showError(error.message);
            }
        });

        field(form, "package_id")?.addEventListener("change", () => {
            const select = field(form, "package_id");
            const fee = field(form, "monthly_fee");

            if (fee) {
                const selected = select?.selectedOptions?.[0];
                const match = selected?.textContent?.match(/-\s*([\d,.]+)\s*$/);
                fee.value = match ? match[1].replace(/,/g, "") : "";
            }
        });

        field(form, "division_id")?.addEventListener("change", async () => {
            try {
                await loadDistricts(form, value(form, "division_id"));
            } catch (error) {
                showError(error.message);
            }
        });

        field(form, "district_id")?.addEventListener("change", async () => {
            try {
                await loadUpazilas(form, value(form, "district_id"));
            } catch (error) {
                showError(error.message);
            }
        });

        try {
            await loadCsrf(form);

            // Meta already returns MikroTik servers.
            // Load this endpoint only if the list is empty.
            if (!field(form, "mikrotik_id")?.options?.length ||
                field(form, "mikrotik_id").options.length <= 1) {
                await loadRouters(form);
            }

            await loadDivisions(form);
        } catch (error) {
            showError(error.message);
        }
    }

    async function submitForm(event) {
        event.preventDefault();

        const form = event.currentTarget;

        if (loading) return;

        if (!form.reportValidity()) return;

        loading = true;

        const submitButton = form.querySelector(
            "#addCustomerSubmit, [type='submit']"
        );

        const originalText = submitButton?.textContent;

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Saving...";
        }

        try {
            // Always retrieve the current session token before saving.
            const meta = await request(`${API}/form`);
            const token = String(meta.csrf_token || "");

            if (!token) {
                throw new Error("CSRF token পাওয়া যায়নি। পেজটি refresh করুন।");
            }

            const csrf = field(form, "csrf_token");
            if (csrf) csrf.value = token;

            const formData = new FormData(form);
            formData.set("csrf_token", token);

            const response = await fetch(API, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    Accept: "application/json"
                },
                body: formData
            });

            const result = await response.json().catch(() => ({
                success: false,
                message: "Server returned an invalid response."
            }));

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || `Customer save failed (${response.status}).`
                );
            }

            await showSuccess(
                result.message || "Customer added successfully."
            );

            const modalElement = document.getElementById("customerActionModal");

            if (modalElement && window.bootstrap) {
                window.bootstrap.Modal.getOrCreateInstance(modalElement).hide();
            }

            if (window.CustomerList &&
                typeof window.CustomerList.refresh === "function") {
                await window.CustomerList.refresh();
            }
        } catch (error) {
            showError(error.message || "Customer could not be saved.");
        } finally {
            loading = false;

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalText || "Save Customer";
            }
        }
    }

    // Expose initialization for the modal loader.
    window.CustomerAdd = {
        init: initialize
    };

    // Initialize if the form exists when this script loads.
    document.addEventListener("DOMContentLoaded", initialize);

    // Bootstrap modal can be opened repeatedly with freshly loaded HTML.
    document.addEventListener("shown.bs.modal", initialize);

})();
