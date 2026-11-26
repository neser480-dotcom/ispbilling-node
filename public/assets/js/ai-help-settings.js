"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("aiHelpSettingsForm");
    const enabled = document.getElementById("aiEnabled");
    const apiKey = document.getElementById("apiKey");
    const model = document.getElementById("aiModel");
    const knowledge = document.getElementById("aiKnowledge");
    const message = document.getElementById("settingsMessage");
    const saveButton = document.getElementById("saveAiSettings");
    const knowledgeCount = document.getElementById("knowledgeCount");

    if (!form || !enabled || !apiKey || !model || !knowledge || !message) {
        return;
    }

    let saving = false;

    function showMessage(text, success = false) {
        message.textContent = text;
        message.className = success
            ? "ai-message ai-message-success"
            : "ai-message ai-message-error";
    }

    function updateKnowledgeCount() {
        if (knowledgeCount) {
            knowledgeCount.textContent = knowledge.value.length + " / 30000";
        }
    }

    async function getCsrfToken() {
        const response = await fetch("/api/csrf-token", {
            method: "GET",
            credentials: "same-origin",
            headers: { "Accept": "application/json" }
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
                credentials: "same-origin",
                headers: { "Accept": "application/json" }
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to load settings.");
            }

            enabled.value = data.settings.enabled ? "1" : "0";
            model.value = data.settings.model || "openai/gpt-oss-120b";
            knowledge.value = data.knowledge || "";
            apiKey.value = "";

            apiKey.placeholder = data.settings.key_configured
                ? "Groq API Key already saved. Leave blank to keep it."
                : "Enter Groq API Key";

            const usage = data.usage || {};
            document.getElementById("usageMessages").textContent =
                Number(usage.messages || 0).toLocaleString();
            document.getElementById("usageConversations").textContent =
                Number(usage.conversations || 0).toLocaleString();
            document.getElementById("usageTokens").textContent =
                Number(usage.tokens || 0).toLocaleString();

            updateKnowledgeCount();

            showMessage(
                data.settings.key_configured
                    ? "Settings and Knowledge Base loaded. The saved API key is protected."
                    : "Settings loaded. Add a Groq API Key to enable AI Help.",
                true
            );
        } catch (error) {
            showMessage(error.message || "Unable to load settings.");
        }
    }

    knowledge.addEventListener("input", updateKnowledgeCount);

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (saving) return;

        saving = true;
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
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
                    model: model.value,
                    api_key: apiKey.value.trim(),
                    knowledge: knowledge.value
                })
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to save settings.");
            }

            apiKey.value = "";
            showMessage(data.message || "Settings saved successfully.", true);
            await loadSettings();
        } catch (error) {
            showMessage(error.message || "Unable to save settings.");
        } finally {
            saving = false;
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = "Save Settings";
            }
        }
    });

    loadSettings();
});
