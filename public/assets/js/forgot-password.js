"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const stepEmail = document.getElementById("stepEmail");
    const stepOtp = document.getElementById("stepOtp");
    const stepPassword = document.getElementById("stepPassword");
    const stepSuccess = document.getElementById("stepSuccess");

    const emailInput = document.getElementById("forgotEmail");
    const otpInput = document.getElementById("forgotOtp");
    const passwordInput = document.getElementById("newPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");

    const messageBox = document.getElementById("forgotMessage");

    const sendOtpBtn = document.getElementById("sendOtpBtn");
    const verifyOtpBtn = document.getElementById("verifyOtpBtn");
    const resendOtpBtn = document.getElementById("resendOtpBtn");
    const resetPasswordBtn = document.getElementById("resetPasswordBtn");
    const loginBtn = document.getElementById("loginBtn");

    let csrfToken = "";
    let currentEmail = "";

    async function loadCsrfToken() {
        const response = await fetch("/api/auth/csrf", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store"
        });

        const data = await response.json();

        if (!response.ok || !data.success || !data.csrf_token) {
            throw new Error("Unable to initialize security token.");
        }

        csrfToken = data.csrf_token;
    }

    function showMessage(message, type = "error") {
        messageBox.textContent = message;
        messageBox.className = `forgot-message ${type}`;
    }

    function clearMessage() {
        messageBox.textContent = "";
        messageBox.className = "forgot-message";
    }

    function showStep(step) {
        [stepEmail, stepOtp, stepPassword, stepSuccess].forEach((element) => {
            element.classList.remove("active");
        });

        step.classList.add("active");
        clearMessage();
    }

    async function postRequest(url, body) {
        if (!csrfToken) {
            await loadCsrfToken();
        }

        const response = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken
            },
            body: JSON.stringify(body)
        });

        const data = await response.json().catch(() => ({
            success: false,
            message: "Invalid server response."
        }));

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Request failed.");
        }

        return data;
    }

    function setLoading(button, loading, text) {
        if (loading) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.textContent = text;
        } else {
            button.disabled = false;
            button.textContent =
                button.dataset.originalText || text;
        }
    }

    // Send OTP
    async function sendOtp() {
        currentEmail = emailInput.value.trim().toLowerCase();

        if (!currentEmail) {
            showMessage("Please enter your registered Gmail address.");
            return;
        }

        setLoading(sendOtpBtn, true, "Sending OTP...");

        try {
            const data = await postRequest(
                "/api/auth/forgot-password/send-otp",
                { email: currentEmail }
            );

            showStep(stepOtp);
            showMessage(data.message, "success");

        } catch (error) {
            showMessage(error.message);
        } finally {
            setLoading(sendOtpBtn, false, "Send OTP");
        }
    }

    // Verify OTP
    async function verifyOtp() {
        const otp = otpInput.value.trim();

        if (!/^\d{6}$/.test(otp)) {
            showMessage("Please enter the 6-digit OTP.");
            return;
        }

        setLoading(verifyOtpBtn, true, "Verifying...");

        try {
            const data = await postRequest(
                "/api/auth/forgot-password/verify-otp",
                {
                    email: currentEmail,
                    otp: otp
                }
            );

            showStep(stepPassword);
            showMessage(data.message, "success");

        } catch (error) {
            showMessage(error.message);
        } finally {
            setLoading(verifyOtpBtn, false, "Verify OTP");
        }
    }

    // Resend OTP
    async function resendOtp() {
        setLoading(resendOtpBtn, true, "Sending...");

        try {
            const data = await postRequest(
                "/api/auth/forgot-password/send-otp",
                { email: currentEmail }
            );

            otpInput.value = "";
            showMessage(data.message, "success");

        } catch (error) {
            showMessage(error.message);
        } finally {
            setLoading(resendOtpBtn, false, "Resend OTP");
        }
    }

    // Reset password
    async function resetPassword() {
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (password.length < 8) {
            showMessage("Password must be at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            showMessage("Passwords do not match.");
            return;
        }

        setLoading(resetPasswordBtn, true, "Resetting Password...");

        try {
            const data = await postRequest(
                "/api/auth/forgot-password/reset",
                {
                    password: password,
                    confirm_password: confirmPassword
                }
            );

            passwordInput.value = "";
            confirmPasswordInput.value = "";
            otpInput.value = "";

            showStep(stepSuccess);
            showMessage(data.message, "success");

        } catch (error) {
            showMessage(error.message);
        } finally {
            setLoading(resetPasswordBtn, false, "Reset Password");
        }
    }

    sendOtpBtn.addEventListener("click", sendOtp);
    verifyOtpBtn.addEventListener("click", verifyOtp);
    resendOtpBtn.addEventListener("click", resendOtp);
    resetPasswordBtn.addEventListener("click", resetPassword);

    loginBtn.addEventListener("click", () => {
        window.location.href = "/";
    });

    loadCsrfToken().catch((error) => {
        showMessage(error.message);
        sendOtpBtn.disabled = true;
    });

});