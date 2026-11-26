
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const chatMessages = document.getElementById("chatMessages");
    const chatForm = document.getElementById("aiChatForm");
    const chatQuestion = document.getElementById("chatQuestion");
    const sendButton = document.getElementById("sendQuestion");

    if (!chatMessages || !chatForm || !chatQuestion || !sendButton) {
        return;
    }

    let conversationId = null;
    let sending = false;

    function addMessage(type, message) {
        const item = document.createElement("div");

        item.className = `ai-message ai-message-${type}`;

        const content = document.createElement("div");
        content.className = "ai-message-content";
        content.textContent = message;

        item.appendChild(content);
        chatMessages.appendChild(item);

        chatMessages.scrollTop = chatMessages.scrollHeight;

        return item;
    }

    function setLoading(status) {
        sending = status;
        sendButton.disabled = status;
        chatQuestion.disabled = status;
        sendButton.textContent = status ? "Thinking..." : "Send";
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
            throw new Error(
                data.message || "Security token not found."
            );
        }

        return data.csrf_token;
    }

    async function checkStatus() {
        const response = await fetch("/api/ai-help/status", {
            credentials: "same-origin"
        });

        const data = await response.json();

        if (!response.ok || !data.success || !data.enabled) {
            throw new Error(
                data.message || "AI Help is currently unavailable."
            );
        }
    }

    async function sendMessage(message) {
        const csrfToken = await getCsrfToken();

        const response = await fetch("/api/ai-help/chat", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken
            },
            body: JSON.stringify({
                message,
                conversation_id: conversationId
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(
                data.message || "AI response failed."
            );
        }

        conversationId = data.conversation_id || conversationId;

        return data.answer;
    }

    chatForm.addEventListener("submit", async event => {
        event.preventDefault();

        if (sending) return;

        const question = chatQuestion.value.trim();

        if (!question) return;

        addMessage("user", question);

        chatQuestion.value = "";

        setLoading(true);

        const loadingMessage = addMessage(
            "assistant",
            "AI উত্তর তৈরি করছে..."
        );

        try {
            const answer = await sendMessage(question);

            loadingMessage.querySelector(
                ".ai-message-content"
            ).textContent = answer;

        } catch (error) {
            loadingMessage.querySelector(
                ".ai-message-content"
            ).textContent = error.message || "Something went wrong.";

        } finally {
            setLoading(false);
            chatQuestion.focus();
        }
    });

    checkStatus()
        .then(() => {
            addMessage(
                "assistant",
                "আসসালামু আলাইকুম! আমি Amader Bill AI Help। সফটওয়্যার ব্যবহার বা কোনো সমস্যার বিষয়ে প্রশ্ন করুন।"
            );
        })
        .catch(error => {
            addMessage("assistant", error.message);
            chatQuestion.disabled = true;
            sendButton.disabled = true;
        });
});
