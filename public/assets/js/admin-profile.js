"use strict";

document.addEventListener("DOMContentLoaded", function () {

    let profileData = null;

    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function $(id) {
        return document.getElementById(id);
    }


    function escapeHtml(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    function showAlert(message, type = "success") {

        let alert = $("profileAlert");

        /*
        |--------------------------------------------------------------
        | Create alert automatically if HTML does not contain it.
        |--------------------------------------------------------------
        */

        if (!alert) {

            alert = document.createElement("div");

            alert.id = "profileAlert";

            alert.className =
                "alert alert-" + type;

            alert.style.position = "fixed";
            alert.style.top = "80px";
            alert.style.right = "20px";
            alert.style.zIndex = "99999";
            alert.style.minWidth = "300px";
            alert.style.maxWidth = "500px";

            document.body.appendChild(alert);
        }

        alert.className =
            `alert alert-${type}`;

        alert.style.position = "fixed";
        alert.style.top = "80px";
        alert.style.right = "20px";
        alert.style.zIndex = "99999";
        alert.style.minWidth = "300px";
        alert.style.maxWidth = "500px";

        alert.textContent = message;

        alert.classList.remove("d-none");

        setTimeout(function () {

            alert.classList.add("d-none");

        }, 5000);
    }


    /*
    |--------------------------------------------------------------------------
    | CSRF
    |--------------------------------------------------------------------------
    */

    function getCsrfToken() {

        const meta =
            document.querySelector(
                'meta[name="csrf-token"]'
            );

        if (meta && meta.content) {
            return meta.content;
        }

        if (window.CSRF_TOKEN) {
            return window.CSRF_TOKEN;
        }

        /*
        |--------------------------------------------------------------
        | Read token from hidden inputs.
        |--------------------------------------------------------------
        */

        const profileToken =
            $("profileCsrfToken");

        if (
            profileToken &&
            profileToken.value
        ) {
            return profileToken.value;
        }

        const passwordToken =
            $("passwordCsrfToken");

        if (
            passwordToken &&
            passwordToken.value
        ) {
            return passwordToken.value;
        }

        return "";
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD PROFILE
    |--------------------------------------------------------------------------
    */

    async function loadProfile() {

        try {

            const params =
                new URLSearchParams(
                    window.location.search
                );

            const userId =
                params.get("id") ||
                params.get("user_id");

            let url =
                "/admin/profile/data";

            if (userId) {

                url +=
                    "?user_id=" +
                    encodeURIComponent(userId);
            }


            const response =
                await fetch(
                    url,
                    {
                        method: "GET",
                        credentials: "same-origin",
                        headers: {
                            "Accept":
                                "application/json"
                        }
                    }
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    "Failed to load profile."
                );
            }


            profileData = data;

            renderProfile(data);


        } catch (error) {

            console.error(
                "[Admin Profile]",
                error
            );

            showAlert(
                error.message ||
                "Failed to load profile.",
                "danger"
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | RENDER PROFILE
    |--------------------------------------------------------------------------
    */

    function renderProfile(data) {

        const user =
            data.target_user || {};


        /*
        |--------------------------------------------------------------
        | User ID
        |--------------------------------------------------------------
        */

        if ($("profileUserId")) {

            $("profileUserId").value =
                user.id || "";
        }


        /*
        |--------------------------------------------------------------
        | CSRF
        |--------------------------------------------------------------
        */

        const csrf =
            data.csrf_token ||
            getCsrfToken();


        if ($("profileCsrfToken")) {

            $("profileCsrfToken").value =
                csrf;
        }


        if ($("passwordCsrfToken")) {

            $("passwordCsrfToken").value =
                csrf;
        }


        /*
        |--------------------------------------------------------------
        | Settings
        |--------------------------------------------------------------
        */

        if ($("profileName")) {

            $("profileName").value =
                user.display_name ||
                user.name ||
                user.fullname ||
                "";
        }


        if ($("profileCompany")) {

            $("profileCompany").value =
                user.company_name || "";
        }


        if ($("profileEmail")) {

            $("profileEmail").value =
                user.email || "";
        }


        if ($("profileMobile")) {

            $("profileMobile").value =
                user.mobile ||
                user.phone ||
                "";
        }


        if ($("profileAddress")) {

            $("profileAddress").value =
                user.address || "";
        }


        /*
        |--------------------------------------------------------------
        | Profile View
        |--------------------------------------------------------------
        */

        setText(
            "viewCustomerId",
            user.customer_id ||
            user.id ||
            "-"
        );


        setText(
            "viewCompany",
            user.company_name || "-"
        );


        setText(
            "viewName",
            user.display_name ||
            user.name ||
            user.fullname ||
            "-"
        );


        setText(
            "viewUsername",
            user.username || "-"
        );


        setText(
            "viewMobile",
            user.mobile ||
            user.phone ||
            "-"
        );


        setText(
            "viewEmail",
            user.email || "-"
        );


        setText(
            "viewAddress",
            user.address || "-"
        );


        setText(
            "viewUserId",
            user.id || "-"
        );


        setText(
            "viewRole",
            user.role || "-"
        );


        setText(
            "viewCompanyId",
            user.company_id || "-"
        );


        setText(
            "viewStatus",
            user.status || "Active"
        );


        setText(
            "viewTotalCustomer",
            Number(
                data.total_customers || 0
            ).toLocaleString()
        );


        setText(
            "viewTotalCustomers",
            Number(
                data.total_customers || 0
            ).toLocaleString()
        );


        setText(
            "viewCreatedAt",
            user.created_at || "-"
        );


        /*
        |--------------------------------------------------------------
        | Permissions
        |--------------------------------------------------------------
        */

        renderPermissions(data);


        /*
        |--------------------------------------------------------------
        | Profile edit authorization
        |--------------------------------------------------------------
        */

        const canEdit =
            Boolean(
                data.can_edit_profile
            );


        const profileButton =
            $("profileUpdateButton");


        if (profileButton) {

            profileButton.disabled =
                !canEdit;
        }


        /*
        |--------------------------------------------------------------
        | Password
        |--------------------------------------------------------------
        */

        const passwordForm =
            $("passwordUpdateForm");


        if (
            passwordForm &&
            !data.is_own_profile
        ) {

            passwordForm
                .querySelectorAll(
                    "input, button"
                )
                .forEach(function (element) {

                    element.disabled = true;

                });
        }
    }


    function setText(id, value) {

        const element =
            $(id);

        if (!element) {
            return;
        }

        element.textContent =
            value ?? "-";
    }


    /*
    |--------------------------------------------------------------------------
    | RENDER PERMISSIONS
    |--------------------------------------------------------------------------
    */

    function renderPermissions(data) {

        const container =
            $("permissionsContainer");

        if (!container) {
            return;
        }


        const system =
            data.system_permissions || {};


        const saved =
            data.permissions || {};


        const canEdit =
            Boolean(
                data.can_edit_permissions
            );


        const keys =
            Object.keys(system);


        if (!keys.length) {

            container.innerHTML =
                `
                <div class="col-12">
                    <div class="alert alert-warning">
                        No permissions configured.
                    </div>
                </div>
                `;

            return;
        }


        const groups = {};


        keys.forEach(function (key) {

            const item =
                system[key];


            const category =
                item?.category ||
                "other";


            if (!groups[category]) {

                groups[category] = [];
            }


            groups[category].push({
                key: key,
                label:
                    item?.label ||
                    key
            });

        });


        let html = "";


        Object.keys(groups)
            .forEach(function (category) {

                html +=
                    `
                    <div class="col-12 mb-3">
                        <h6 class="text-uppercase text-muted border-bottom pb-2">
                            ${escapeHtml(category)}
                        </h6>
                    </div>
                    `;


                groups[category]
                    .forEach(function (permission) {

                        const checked =
                            Boolean(
                                saved[
                                    permission.key
                                ]
                            );


                        html +=
                            `
                            <div class="col-lg-4 col-md-6">
                                <div class="permission-item ${
                                    !canEdit
                                        ? "disabled-permission"
                                        : ""
                                }">

                                    <div class="form-check">

                                        <input
                                            class="form-check-input permission-checkbox"
                                            type="checkbox"
                                            value="${escapeHtml(permission.key)}"
                                            ${
                                                checked
                                                    ? "checked"
                                                    : ""
                                            }
                                            ${
                                                !canEdit
                                                    ? "disabled"
                                                    : ""
                                            }
                                        >

                                        <label class="form-check-label">

                                            <span class="permission-title">
                                                ${escapeHtml(permission.label)}
                                            </span>

                                            <span class="permission-key">
                                                ${escapeHtml(permission.key)}
                                            </span>

                                        </label>

                                    </div>

                                </div>
                            </div>
                            `;
                    });

            });


        container.innerHTML =
            html;


        const markAll =
            $("markAllPermissions");


        const save =
            $("savePermissionsBtn") ||
            $("savePermissions");


        const readonly =
            $("permissionReadonlyNote");


        if (markAll) {

            markAll.disabled =
                !canEdit;
        }


        if (save) {

            save.disabled =
                !canEdit;
        }


        if (readonly) {

            readonly.classList.toggle(
                "d-none",
                canEdit
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | MARK ALL
    |--------------------------------------------------------------------------
    */

    const markAll =
        $("markAllPermissions");


    if (markAll) {

        markAll.addEventListener(
            "click",
            function () {

                if (
                    markAll.disabled
                ) {
                    return;
                }


                const boxes =
                    document.querySelectorAll(
                        ".permission-checkbox:not(:disabled)"
                    );


                if (!boxes.length) {
                    return;
                }


                let shouldCheck =
                    false;


                boxes.forEach(
                    function (box) {

                        if (!box.checked) {

                            shouldCheck =
                                true;
                        }
                    }
                );


                boxes.forEach(
                    function (box) {

                        box.checked =
                            shouldCheck;
                    }
                );


                markAll.innerHTML =
                    shouldCheck
                        ? '<i class="fas fa-times me-1"></i> Unmark All'
                        : '<i class="fas fa-check-double me-1"></i> Mark All';
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | SAVE PERMISSIONS
    |--------------------------------------------------------------------------
    */

    const savePermissions =
        $("savePermissionsBtn") ||
        $("savePermissions");


    if (savePermissions) {

        savePermissions.addEventListener(
            "click",
            async function () {

                if (
                    savePermissions.disabled ||
                    !profileData
                ) {
                    return;
                }


                const userId =
                    Number(
                        profileData
                            .target_user
                            ?.id || 0
                    );


                const csrf =
                    getCsrfToken();


                const selected = [];


                document
                    .querySelectorAll(
                        ".permission-checkbox:checked:not(:disabled)"
                    )
                    .forEach(
                        function (box) {

                            selected.push(
                                box.value
                            );
                        }
                    );


                const originalText =
                    savePermissions.innerHTML;


                savePermissions.disabled =
                    true;


                savePermissions.innerHTML =
                    '<i class="fas fa-spinner fa-spin me-1"></i> Saving...';


                try {

                    const response =
                        await fetch(
                            "/admin/permissions/update",
                            {
                                method: "POST",
                                credentials: "same-origin",
                                headers: {
                                    "Content-Type":
                                        "application/json",
                                    "Accept":
                                        "application/json"
                                },
                                body:
                                    JSON.stringify({
                                        user_id:
                                            userId,
                                        permissions:
                                            selected,
                                        csrf_token:
                                            csrf
                                    })
                            }
                        );


                    const data =
                        await response.json();


                    if (
                        !response.ok ||
                        !data.success
                    ) {

                        throw new Error(
                            data.message ||
                            "Failed to save permissions."
                        );
                    }


                    showAlert(
                        data.message ||
                        "Permissions updated successfully.",
                        "success"
                    );


                    await loadProfile();


                } catch (error) {

                    console.error(
                        "[Admin Permissions]",
                        error
                    );


                    showAlert(
                        error.message ||
                        "Failed to save permissions.",
                        "danger"
                    );


                } finally {

                    savePermissions.disabled =
                        !profileData
                            ?.can_edit_permissions;


                    savePermissions.innerHTML =
                        originalText;
                }
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | UPDATE PROFILE
    |--------------------------------------------------------------------------
    */

    const profileForm =
        $("profileUpdateForm");


    if (profileForm) {

        profileForm.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                const button =
                    $("profileUpdateButton");


                if (
                    button &&
                    button.disabled
                ) {
                    return;
                }


                if (button) {

                    button.disabled =
                        true;

                    button.innerHTML =
                        '<i class="fas fa-spinner fa-spin me-1"></i> Updating...';
                }


                try {

                    const formData =
                        new FormData(
                            profileForm
                        );


                    const body =
                        Object.fromEntries(
                            formData.entries()
                        );


                    /*
                    |------------------------------------------------------
                    | Make sure correct CSRF token is sent.
                    |------------------------------------------------------
                    */

                    body.csrf_token =
                        getCsrfToken();


                    const response =
                        await fetch(
                            "/admin/profile/update",
                            {
                                method: "POST",
                                credentials: "same-origin",
                                headers: {
                                    "Content-Type":
                                        "application/json",
                                    "Accept":
                                        "application/json"
                                },
                                body:
                                    JSON.stringify(
                                        body
                                    )
                            }
                        );


                    const data =
                        await response.json();


                    if (
                        !response.ok ||
                        !data.success
                    ) {

                        throw new Error(
                            data.message ||
                            "Profile update failed."
                        );
                    }


                    showAlert(
                        data.message ||
                        "Profile updated successfully.",
                        "success"
                    );


                    await loadProfile();


                } catch (error) {

                    console.error(
                        "[Admin Profile Update]",
                        error
                    );


                    showAlert(
                        error.message ||
                        "Profile update failed.",
                        "danger"
                    );


                } finally {

                    if (button) {

                        button.disabled =
                            false;

                        button.innerHTML =
                            '<i class="fas fa-save me-1"></i> Update Profile';
                    }
                }
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | UPDATE PASSWORD
    |--------------------------------------------------------------------------
    */

    const passwordForm =
        $("passwordUpdateForm");


    if (passwordForm) {

        passwordForm.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                const button =
                    $("passwordUpdateButton");


                if (
                    button &&
                    button.disabled
                ) {
                    return;
                }


                if (button) {

                    button.disabled =
                        true;

                    button.innerHTML =
                        '<i class="fas fa-spinner fa-spin me-1"></i> Updating...';
                }


                try {

                    const formData =
                        new FormData(
                            passwordForm
                        );


                    const body =
                        Object.fromEntries(
                            formData.entries()
                        );


                    /*
                    |------------------------------------------------------
                    | Make sure correct CSRF token is sent.
                    |------------------------------------------------------
                    */

                    body.csrf_token =
                        getCsrfToken();


                    if (
                        !body.old_password ||
                        !body.new_password ||
                        !body.confirm_password
                    ) {

                        throw new Error(
                            "All password fields are required."
                        );
                    }


                    if (
                        String(
                            body.new_password
                        ).length < 8
                    ) {

                        throw new Error(
                            "New password must be at least 8 characters."
                        );
                    }


                    if (
                        body.new_password !==
                        body.confirm_password
                    ) {

                        throw new Error(
                            "New password and confirmation password do not match."
                        );
                    }


                    const response =
                        await fetch(
                            "/admin/profile/password",
                            {
                                method: "POST",
                                credentials: "same-origin",
                                headers: {
                                    "Content-Type":
                                        "application/json",
                                    "Accept":
                                        "application/json"
                                },
                                body:
                                    JSON.stringify(
                                        body
                                    )
                            }
                        );


                    const data =
                        await response.json();


                    if (
                        !response.ok ||
                        !data.success
                    ) {

                        throw new Error(
                            data.message ||
                            "Password update failed."
                        );
                    }


                    showAlert(
                        data.message ||
                        "Password updated successfully.",
                        "success"
                    );


                    passwordForm.reset();


                } catch (error) {

                    console.error(
                        "[Password Update]",
                        error
                    );


                    showAlert(
                        error.message ||
                        "Password update failed.",
                        "danger"
                    );


                } finally {

                    if (button) {

                        button.disabled =
                            false;

                        button.innerHTML =
                            '<i class="fas fa-key me-1"></i> Change Password';
                    }
                }
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    loadProfile();

});