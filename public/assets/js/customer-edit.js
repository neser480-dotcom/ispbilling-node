
"use strict";

(function () {
    if (window.CustomerEditInitialized) return;
    window.CustomerEditInitialized = true;

    const API = "/api/customers/add";

    function notify(type, message) {
        if (window.Swal) {
            window.Swal.fire({
                toast: true,
                position: "top-end",
                icon: type,
                title: message,
                showConfirmButton: false,
                timer: 3500
            });
        } else {
            alert(message);
        }
    }

    async function requestJson(url) {
        const response = await fetch(url, {
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        });

        const result = await response.json();

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "তথ্য লোড করা যায়নি।");
        }

        return result;
    }

    function rowsFrom(result) {
        if (Array.isArray(result)) return result;

        for (const key of [
            "data", "items", "rows", "results",
            "mikrotiks", "routers", "packages",
            "areas", "subAreas", "divisions",
            "districts", "upazilas"
        ]) {
            if (Array.isArray(result[key])) return result[key];
        }

        return [];
    }

    function rowId(row) {
        return String(
            row.id ??
            row.value ??
            row.mikrotik_id ??
            row.package_id ??
            row.area_id ??
            row.sub_area_id ??
            row.division_id ??
            row.district_id ??
            row.upazila_id ??
            ""
        );
    }

    function rowName(row) {
        return String(
            row.name ??
            row.title ??
            row.router_name ??
            row.mikrotik_name ??
            row.package_name ??
            row.area_name ??
            row.sub_area_name ??
            row.nameBn ??
            row.name_bn ??
            row.bn_name ??
            row.username ??
            ""
        );
    }

    function findSelect(form, names) {
        for (const name of names) {
            const el = form.querySelector(
                `[name="${name}"], #${CSS.escape(name)}`
            );
            if (el && el.tagName === "SELECT") return el;
        }
        return null;
    }

    function setOptions(select, rows, selected, placeholder) {
        if (!select) return;

        const selectedValue = String(selected ?? "");
        select.replaceChildren();

        const first = document.createElement("option");
        first.value = "";
        first.textContent = placeholder;
        select.appendChild(first);

        rows.forEach(row => {
            const id = rowId(row);
            if (!id) return;

            const option = document.createElement("option");
            option.value = id;
            option.textContent = rowName(row) || id;
            select.appendChild(option);
        });

        const options = Array.from(select.options);

        // Match by id first; otherwise by visible name (Division / District /
        // Upazila are stored as text names in the database).
        const match =
            options.find(o => o.value === selectedValue) ||
            (selectedValue &&
                options.find(o =>
                    o.value !== "" &&
                    o.textContent.trim() === selectedValue.trim()
                ));

        if (match) {
            select.value = match.value;
            return;
        }

        if (selectedValue) {
            const option = document.createElement("option");
            option.value = selectedValue;
            option.textContent = selectedValue;
            select.appendChild(option);
        }

        select.value = selectedValue;
    }

    function setLoading(select, label) {
        if (!select) return;
        select.replaceChildren();
        const option = document.createElement("option");
        option.value = "";
        option.textContent = label;
        select.appendChild(option);
    }

    async function loadOptions(select, url, selected, placeholder) {
        if (!select) return;

        setLoading(select, "লোড হচ্ছে...");

        try {
            const result = await requestJson(url);
            setOptions(select, rowsFrom(result), selected, placeholder);
        } catch (error) {
            setOptions(select, [], "", "লোড করা যায়নি");
            throw error;
        }
    }

    function initForm(form) {
        if (form.dataset.editDropdownsInitialized === "1") return;
        form.dataset.editDropdownsInitialized = "1";

        const router = findSelect(form, [
            "mikrotik_id", "router_id", "mikrotik"
        ]);

        const pkg = findSelect(form, [
            "package_id", "package"
        ]);

        const area = findSelect(form, [
            "area_id", "area"
        ]);

        const subArea = findSelect(form, [
            "sub_area_id", "sub_area"
        ]);

        const division = findSelect(form, [
            "division_id", "division"
        ]);

        const district = findSelect(form, [
            "district_id", "district"
        ]);

        const upazila = findSelect(form, [
            "upazila_id", "upazila"
        ]);

        const initial = {
            router: router?.value || form.dataset.mikrotikId || "",
            package: pkg?.value || form.dataset.packageId || "",
            area: area?.value || form.dataset.areaId || "",
            subArea: subArea?.value || form.dataset.subAreaId || "",
            division: division?.value || form.dataset.divisionId || "",
            district: district?.value || form.dataset.districtId || "",
            upazila: upazila?.value || form.dataset.upazilaId || ""
        };

        async function loadPackages(selected = "") {
            if (!pkg) return;

            const routerId = router?.value || initial.router;

            if (!routerId) {
                setOptions(pkg, [], "", "আগে MikroTik নির্বাচন করুন");
                return;
            }

            await loadOptions(
                pkg,
                `${API}/packages?router_id=${encodeURIComponent(routerId)}`,
                selected,
                "Package নির্বাচন করুন"
            );
        }

        async function loadAreas(selected = "") {
            if (!area) return;

            const routerId = router?.value || initial.router;

            if (!routerId) {
                setOptions(area, [], "", "আগে MikroTik নির্বাচন করুন");
                return;
            }

            await loadOptions(
                area,
                `${API}/areas?mikrotik_id=${encodeURIComponent(routerId)}`,
                selected,
                "Area নির্বাচন করুন"
            );
        }

        async function loadSubAreas(selected = "") {
            if (!subArea) return;

            const areaId = area?.value || "";

            if (!areaId) {
                setOptions(subArea, [], "", "আগে Area নির্বাচন করুন");
                return;
            }

            await loadOptions(
                subArea,
                `${API}/sub-areas?area_id=${encodeURIComponent(areaId)}`,
                selected,
                "Sub-Area নির্বাচন করুন"
            );
        }

        async function loadDistrictOptions(selected = "") {
            if (!district) return;

            const divisionId = division?.value || "";

            if (!divisionId) {
                setOptions(district, [], "", "আগে Division নির্বাচন করুন");
                return;
            }

            await loadOptions(
                district,
                `${API}/districts?division_id=${encodeURIComponent(divisionId)}`,
                selected,
                "District নির্বাচন করুন"
            );
        }

        async function loadUpazilas(selected = "") {
            if (!upazila) return;

            const districtId = district?.value || "";

            if (!districtId) {
                setOptions(upazila, [], "", "আগে District নির্বাচন করুন");
                return;
            }

            await loadOptions(
                upazila,
                `${API}/upazilas?district_id=${encodeURIComponent(districtId)}`,
                selected,
                "Upazila নির্বাচন করুন"
            );
        }

        async function initialize() {
            const jobs = [];

            if (router) {
                jobs.push(loadOptions(
                    router,
                    `${API}/mikrotiks`,
                    initial.router,
                    "MikroTik নির্বাচন করুন"
                ));
            }

            if (division) {
                jobs.push(loadOptions(
                    division,
                    `${API}/divisions`,
                    initial.division,
                    "Division নির্বাচন করুন"
                ));
            }

            await Promise.all(jobs);

            if (router?.value) {
                await Promise.all([
                    loadPackages(initial.package),
                    loadAreas(initial.area)
                ]);
            }

            if (area?.value) {
                await loadSubAreas(initial.subArea);
            }

            if (division?.value) {
                await loadDistrictOptions(initial.district);
            }

            if (district?.value) {
                await loadUpazilas(initial.upazila);
            }
        }

        router?.addEventListener("change", async function () {
            initial.router = router.value;
            initial.package = "";
            initial.area = "";
            initial.subArea = "";

            try {
                await Promise.all([
                    loadPackages(""),
                    loadAreas("")
                ]);
                if (subArea) setOptions(subArea, [], "", "আগে Area নির্বাচন করুন");
            } catch (error) {
                notify("error", error.message);
            }
        });

        area?.addEventListener("change", async function () {
            try {
                await loadSubAreas("");
            } catch (error) {
                notify("error", error.message);
            }
        });

        division?.addEventListener("change", async function () {
            try {
                if (district) setOptions(district, [], "", "লোড হচ্ছে...");
                if (upazila) setOptions(upazila, [], "", "আগে District নির্বাচন করুন");
                await loadDistrictOptions("");
            } catch (error) {
                notify("error", error.message);
            }
        });

        district?.addEventListener("change", async function () {
            try {
                await loadUpazilas("");
            } catch (error) {
                notify("error", error.message);
            }
        });

        initialize().catch(error => notify("error", error.message));
    }

    function getCsrfToken() {
        return fetch("/api/csrf-token", {
            method: "GET",
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        }).then(async response => {
            const result = await response.json();

            if (!response.ok) {
                throw new Error("CSRF token পাওয়া যায়নি।");
            }

            const token =
                result.csrf_token ||
                result.csrfToken ||
                result.token;

            if (!token) {
                throw new Error("CSRF token response-এ নেই।");
            }

            return token;
        });
    }

    document.addEventListener("shown.bs.modal", function (event) {
        if (event.target.id !== "customerActionModal") return;

        const form = event.target.querySelector(
            "#customerActionModalBody form.customer-edit-form"
        );

        if (form) initForm(form);
    });

    document.addEventListener("submit", async function (event) {
        const form = event.target.closest(
            "#customerActionModalBody form.customer-edit-form"
        );

        if (!form) return;

        event.preventDefault();

        if (form.dataset.submitting === "1") return;

        const submit = form.querySelector('[type="submit"]');

        try {
            form.dataset.submitting = "1";
            if (submit) submit.disabled = true;

            const token = await getCsrfToken();
            const data = new FormData(form);
            data.set("csrf_token", token);

            // Division / District / Upazila are saved as text names.
            for (const [field, selectName] of [
                ["division", "division_id"],
                ["district", "district_id"],
                ["upazila", "upazila_id"]
            ]) {
                const sel = form.querySelector(`select[name="${selectName}"]`);

                if (sel && sel.options.length > 1) {
                    const opt = sel.options[sel.selectedIndex];
                    data.set(
                        field,
                        sel.selectedIndex > 0 ? opt.textContent.trim() : ""
                    );
                }
            }

            const response = await fetch(
                form.action || "/api/customers/update",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                        Accept: "application/json"
                    },
                    body: data
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Customer update ব্যর্থ হয়েছে।"
                );
            }

            notify("success", result.message || "Customer updated.");

            const modal = document.getElementById("customerActionModal");

            if (modal && window.bootstrap) {
                window.bootstrap.Modal.getOrCreateInstance(modal).hide();
            }

            if (
                window.CustomerList &&
                typeof window.CustomerList.refresh === "function"
            ) {
                window.CustomerList.refresh();
            } else {
                window.location.reload();
            }
        } catch (error) {
            notify("error", error.message || "Customer update ব্যর্থ হয়েছে।");
        } finally {
            delete form.dataset.submitting;
            if (submit) submit.disabled = false;
        }
    });

    // Supports a form inserted into the modal before this script's event runs.
    document.addEventListener("DOMContentLoaded", function () {
        const form = document.querySelector(
            "#customerActionModalBody form.customer-edit-form"
        );
        if (form) initForm(form);
    });
// Initialise edit forms inserted into the modal later (for example the
    // Update Profile panel inside the Profile popup).
    function watchModalBody() {
        const body = document.getElementById("customerActionModalBody");
        if (!body || body.dataset.editWatch === "1") return;
        body.dataset.editWatch = "1";
        new MutationObserver(function () {
            body.querySelectorAll("form.customer-edit-form").forEach(initForm);
        }).observe(body, { childList: true, subtree: true });
    }
    watchModalBody();
    document.addEventListener("DOMContentLoaded", watchModalBody);

    
})();
