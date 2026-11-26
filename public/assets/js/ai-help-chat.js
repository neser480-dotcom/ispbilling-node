"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const chatMessages = document.getElementById("chatMessages");
    const chatForm = document.getElementById("aiChatForm");
    const chatQuestion = document.getElementById("chatQuestion");
    const sendButton = document.getElementById("sendQuestion");
    const historyList = document.getElementById("chatHistoryList");
    const newChatButton = document.getElementById("newAiChat");
    const suggestions = document.getElementById("aiSuggestions");

    if (!chatMessages || !chatForm || !chatQuestion || !sendButton) return;

    const storageKey = "amaderbill_ai_help_conversation";
    let conversationId = null;
    let sending = false;

    function addMessage(type, message) {
        const item = document.createElement("article");
        item.className = "ai-message ai-message-" + type;

        const content = document.createElement("div");
        content.className = "ai-message-content";
        content.textContent = String(message || "");

        item.appendChild(content);
        chatMessages.appendChild(item);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return item;
    }

    function showWelcome() {
        if (!chatMessages.children.length) {
            addMessage(
                "assistant",
                "আসসালামু আলাইকুম! আমি Amader Bill AI Help। সফটওয়্যারের যাচাইকৃত ফিচার ও ব্যবহারবিধি সম্পর্কে প্রশ্ন করুন। Knowledge Base-এ তথ্য না থাকলে আমি অনুমান করে উত্তর দেব না।"
            );
        }
    }

    function setLoading(status) {
        sending = status;
        sendButton.disabled = status;
        chatQuestion.disabled = status;
        sendButton.textContent = status ? "Thinking..." : "Send";
    }

    async function getCsrfToken() {
        const response = await fetch("/api/csrf-token", {
            credentials: "same-origin",
            headers: { "Accept": "application/json" }
        });
        const data = await response.json();

        if (!response.ok || !data.success || !data.csrf_token) {
            throw new Error(data.message || "Security token not found.");
        }
        return data.csrf_token;
    }

    async function apiGet(url) {
        const response = await fetch(url, {
            credentials: "same-origin",
            headers: { "Accept": "application/json" }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to load AI Help data.");
        }
        return data;
    }

    async function checkStatus() {
        const data = await apiGet("/api/ai-help/status");
        if (!data.enabled) {
            throw new Error("AI Help is currently unavailable. Please contact your Admin.");
        }
    }

    async function loadConversations() {
        if (!historyList) return [];
        try {
            const data = await apiGet("/api/ai-help/conversations?limit=50");
            const conversations = Array.isArray(data.conversations)
                ? data.conversations : [];

            historyList.replaceChildren();

            if (!conversations.length) {
                const empty = document.createElement("p");
                empty.className = "ai-muted-note";
                empty.textContent = "No previous conversations.";
                historyList.appendChild(empty);
                return conversations;
            }

            conversations.forEach(item => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "ai-history-item";
                button.dataset.conversationId = item.conversation_id;
                button.textContent = item.last_question || "Previous conversation";
                button.title = item.last_question || "Previous conversation";
                if (item.conversation_id === conversationId) {
                    button.classList.add("active");
                }
                historyList.appendChild(button);
            });
            return conversations;
        } catch (error) {
            historyList.textContent = error.message;
            return [];
        }
    }

    async function openConversation(id) {
        if (!id || sending) return;
        conversationId = id;
        localStorage.setItem(storageKey, id);
        chatMessages.replaceChildren();

        try {
            const data = await apiGet(
                "/api/ai-help/history?conversation_id=" + encodeURIComponent(id)
            );
            (data.messages || []).forEach(row => {
                addMessage("user", row.question);
                addMessage("assistant", row.answer);
            });
            showWelcome();
            await loadConversations();
        } catch (error) {
            addMessage("error", error.message || "Unable to load this conversation.");
        }
    }

    function startNewConversation() {
        if (sending) return;
        conversationId = null;
        localStorage.removeItem(storageKey);
        chatMessages.replaceChildren();
        showWelcome();
        loadConversations();
        chatQuestion.focus();
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
            throw new Error(data.message || "AI response failed.");
        }

        conversationId = data.conversation_id || conversationId;
        if (conversationId) localStorage.setItem(storageKey, conversationId);
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

        const pending = addMessage("assistant", "উত্তর তৈরি হচ্ছে...");
        try {
            const answer = await sendMessage(question);
            pending.querySelector(".ai-message-content").textContent = answer;
            await loadConversations();
        } catch (error) {
            pending.className = "ai-message ai-message-error";
            pending.querySelector(".ai-message-content").textContent =
                error.message || "Something went wrong.";
        } finally {
            setLoading(false);
            chatQuestion.focus();
        }
    });

    if (historyList) {
        historyList.addEventListener("click", event => {
            const button = event.target.closest("[data-conversation-id]");
            if (button) openConversation(button.dataset.conversationId);
        });
    }

    if (newChatButton) {
        newChatButton.addEventListener("click", startNewConversation);
    }

    if (suggestions) {
        suggestions.addEventListener("click", event => {
            const button = event.target.closest("[data-question]");
            if (!button || sending) return;
            chatQuestion.value = button.dataset.question || "";
            chatQuestion.focus();
        });
    }

    chatQuestion.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            chatForm.requestSubmit();
        }
    });

    (async () => {
        try {
            await checkStatus();
            const conversations = await loadConversations();
            const savedId = localStorage.getItem(storageKey);
            const savedExists = conversations.some(
                item => item.conversation_id === savedId
            );

            if (savedId && savedExists) {
                await openConversation(savedId);
            } else {
                startNewConversation();
            }
        } catch (error) {
            addMessage("error", error.message || "AI Help is unavailable.");
            chatQuestion.disabled = true;
            sendButton.disabled = true;
        }
    })();
});
