
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("aiHelpSettingsForm");
    const enabled = document.getElementById("aiEnabled");
    const apiKey = document.getElementById("apiKey");
    const model = document.getElementById("aiModel");
    const message = document.getElementById("settingsMessage");

    if (!form || !enabled || !apiKey || !model || !message) {
        return;
    }

    let saving = false;

    function showMessage(text, success = false) {
        message.textContent = text;
        message.className = success
            ? "ai-message ai-message-success"
            : "ai-message ai-message-error";
    }

    async function getCsrfToken() {
        const response = await fetch("/api/csrf-token", {
            method: "GET",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        });

        const data = await response.json();

        if (!response.ok || !data.success || !data.csrf_token) {
            throw new Error(data.message || "CSRF token not found.");
        }

        return data.csrf_token;
    }

    async function loadSettings() {
        try {
            const response = await fetch("/api/ai-help/settings", {
                credentials: "same-origin"
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to load settings.");
            }

            enabled.value = data.settings.enabled ? "1" : "0";

            model.value = data.settings.model || "openai/gpt-oss-120b";

            apiKey.value = "";

            apiKey.placeholder = data.settings.key_configured
                ? "Groq API Key already saved. Leave blank to keep it."
                : "Enter Groq API Key";

            showMessage(
                data.settings.key_configured
                    ? "Settings loaded. Groq API Key is already configured."
                    : "Settings loaded. Please enter your Groq API Key.",
                true
            );

        } catch (error) {
            showMessage(error.message);
        }
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();

        if (saving) return;

        saving = true;

        const button = form.querySelector('button[type="submit"]');

        if (button) {
            button.disabled = true;
            button.textContent = "Saving...";
        }

        try {
            const csrfToken = await getCsrfToken();

            const response = await fetch("/api/ai-help/settings", {
                method: "PUT",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken
                },
                body: JSON.stringify({
                    enabled: enabled.value === "1",
                    model: model.value.trim(),
                    api_key: apiKey.value.trim()
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to save settings.");
            }

            apiKey.value = "";

            showMessage(
                data.message || "Settings saved successfully.",
                true
            );

            await loadSettings();

        } catch (error) {
            showMessage(error.message);

        } finally {
            saving = false;

            if (button) {
                button.disabled = false;
                button.textContent = "Save Settings";
            }
        }
    });

    loadSettings();
});
