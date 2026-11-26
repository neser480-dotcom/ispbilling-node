"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const chatMessages = document.getElementById("chatMessages");
    const chatForm = document.getElementById("aiChatForm");
    const chatQuestion = document.getElementById("chatQuestion");
    const sendButton = document.getElementById("sendQuestion");
    const historyList = document.getElementById("chatHistoryList");
    const newChatButton = document.getElementById("newAiChat");
    const suggestions = document.getElementById("aiSuggestions");
    const micButton = document.getElementById("aiVoiceMic");
    const voiceOutputButton = document.getElementById("aiVoiceOutput");
    const stopSpeakingButton = document.getElementById("aiVoiceStop");
    const voiceStatus = document.getElementById("aiVoiceStatus");
    const voiceOrb = document.getElementById("aiVoiceOrb");

    if (!chatMessages || !chatForm || !chatQuestion || !sendButton) return;

    const storageKey = "amaderbill_ai_help_conversation";
    let conversationId = null;
    let sending = false;
    let voiceOutputEnabled = true;
    let recognition = null;
    let listening = false;
    let speaking = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const speechSupported = Boolean(SpeechRecognition);
    const synthesisSupported = "speechSynthesis" in window;

    function setVoiceState(state, message) {
        if (voiceStatus) voiceStatus.textContent = message;
        if (voiceOrb) {
            voiceOrb.classList.remove("is-listening", "is-thinking", "is-speaking");
            if (state) voiceOrb.classList.add("is-" + state);
        }
    }

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
            addMessage("assistant", "আসসালামু আলাইকুম! আমি Amader Bill AI Assistant। লিখে অথবা মাইক্রোফোনে কথা বলে প্রশ্ন করুন। আমি যাচাইকৃত Knowledge Base অনুযায়ী উত্তর দেব।");
        }
    }

    function setLoading(status) {
        sending = status;
        sendButton.disabled = status;
        chatQuestion.disabled = status;
        sendButton.textContent = status ? "Thinking..." : "Send";
        if (status) setVoiceState("thinking", "আপনার প্রশ্নের উত্তর তৈরি করছি...");
        else if (!listening && !speaking) setVoiceState("", "প্রস্তুত • কথা বলতে মাইক্রোফোন চাপুন");
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
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to load AI Help data.");
        return data;
    }

    async function checkStatus() {
        const data = await apiGet("/api/ai-help/status");
        if (!data.enabled) throw new Error("AI Help is currently unavailable. Please contact your Admin.");
    }

    async function loadConversations() {
        if (!historyList) return [];
        try {
            const data = await apiGet("/api/ai-help/conversations?limit=50");
            const conversations = Array.isArray(data.conversations) ? data.conversations : [];
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
                if (item.conversation_id === conversationId) button.classList.add("active");
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
        stopSpeaking();
        if (recognition && listening) recognition.stop();
        conversationId = id;
        localStorage.setItem(storageKey, id);
        chatMessages.replaceChildren();
        try {
            const data = await apiGet("/api/ai-help/history?conversation_id=" + encodeURIComponent(id));
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
        stopSpeaking();
        if (recognition && listening) recognition.stop();
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
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
            body: JSON.stringify({ message, conversation_id: conversationId })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || "AI response failed.");
        conversationId = data.conversation_id || conversationId;
        if (conversationId) localStorage.setItem(storageKey, conversationId);
        return data.answer;
    }

    function speak(text) {
        if (!voiceOutputEnabled || !synthesisSupported || !text) return;
        stopSpeaking();
        const utterance = new SpeechSynthesisUtterance(String(text));
        utterance.lang = /[\u0980-\u09FF]/.test(text) ? "bn-BD" : "en-US";
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.onstart = () => {
            speaking = true;
            setVoiceState("speaking", "উত্তর শোনাচ্ছি...");
        };
        utterance.onend = () => {
            speaking = false;
            setVoiceState("", "প্রস্তুত • আবার কথা বলতে পারেন");
        };
        utterance.onerror = () => {
            speaking = false;
            setVoiceState("", "ভয়েস প্লেব্যাক বন্ধ হয়েছে");
        };
        window.speechSynthesis.speak(utterance);
    }

    function stopSpeaking() {
        if (synthesisSupported) window.speechSynthesis.cancel();
        speaking = false;
        if (!sending && !listening) setVoiceState("", "প্রস্তুত • কথা বলতে মাইক্রোফোন চাপুন");
    }

    async function submitQuestion(question) {
        if (!question || sending) return;
        addMessage("user", question);
        chatQuestion.value = "";
        setLoading(true);
        const pending = addMessage("assistant", "উত্তর তৈরি হচ্ছে...");
        try {
            const answer = await sendMessage(question);
            pending.querySelector(".ai-message-content").textContent = answer || "কোনো উত্তর পাওয়া যায়নি।";
            await loadConversations();
            speak(answer);
        } catch (error) {
            pending.className = "ai-message ai-message-error";
            pending.querySelector(".ai-message-content").textContent = error.message || "Something went wrong.";
            setVoiceState("", "উত্তর পাওয়া যায়নি");
        } finally {
            setLoading(false);
            chatQuestion.focus();
        }
    }

    function setupRecognition() {
        if (!speechSupported) {
            if (micButton) {
                micButton.disabled = true;
                micButton.title = "এই ব্রাউজারে Speech Recognition সমর্থিত নয়";
            }
            setVoiceState("", "এই ব্রাউজারে ভয়েস ইনপুট নেই • লিখে প্রশ্ন করুন");
            return;
        }

        recognition = new SpeechRecognition();
        recognition.lang = "bn-BD";
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            listening = true;
            if (micButton) {
                micButton.classList.add("is-active");
                micButton.setAttribute("aria-pressed", "true");
            }
            setVoiceState("listening", "শুনছি... এখন কথা বলুন");
        };

        recognition.onresult = event => {
            let finalText = "";
            let interimText = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) finalText += transcript;
                else interimText += transcript;
            }
            chatQuestion.value = finalText || interimText;
            if (finalText.trim()) {
                recognition.stop();
                submitQuestion(finalText.trim());
            }
        };

        recognition.onerror = event => {
            listening = false;
            if (event.error !== "no-speech" && event.error !== "aborted") {
                setVoiceState("", event.error === "not-allowed"
                    ? "মাইক্রোফোন ব্যবহারের অনুমতি দিন"
                    : "ভয়েস ইনপুটে সমস্যা হয়েছে • আবার চেষ্টা করুন");
            }
        };

        recognition.onend = () => {
            listening = false;
            if (micButton) {
                micButton.classList.remove("is-active");
                micButton.setAttribute("aria-pressed", "false");
            }
            if (!sending && !speaking) setVoiceState("", "প্রস্তুত • কথা বলতে মাইক্রোফোন চাপুন");
        };
    }

    chatForm.addEventListener("submit", event => {
        event.preventDefault();
        if (sending) return;
        const question = chatQuestion.value.trim();
        if (question) submitQuestion(question);
    });

    if (micButton) {
        micButton.addEventListener("click", () => {
            if (!recognition || sending) return;
            if (listening) {
                recognition.stop();
                return;
            }
            stopSpeaking();
            chatQuestion.value = "";
            try {
                recognition.start();
            } catch (error) {
                setVoiceState("", "মাইক্রোফোন চালু করা যাচ্ছে না • আবার চেষ্টা করুন");
            }
        });
    }

    if (voiceOutputButton) {
        voiceOutputButton.addEventListener("click", () => {
            voiceOutputEnabled = !voiceOutputEnabled;
            voiceOutputButton.classList.toggle("is-enabled", voiceOutputEnabled);
            voiceOutputButton.setAttribute("aria-pressed", String(voiceOutputEnabled));
            voiceOutputButton.textContent = voiceOutputEnabled ? "🔊 Voice On" : "🔇 Voice Off";
            if (!voiceOutputEnabled) stopSpeaking();
        });
    }

    if (stopSpeakingButton) stopSpeakingButton.addEventListener("click", stopSpeaking);

    if (historyList) {
        historyList.addEventListener("click", event => {
            const button = event.target.closest("[data-conversation-id]");
            if (button) openConversation(button.dataset.conversationId);
        });
    }
    if (newChatButton) newChatButton.addEventListener("click", startNewConversation);

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

    setupRecognition();
    if (!synthesisSupported && voiceOutputButton) {
        voiceOutputButton.disabled = true;
        voiceOutputButton.title = "এই ব্রাউজারে Speech Synthesis সমর্থিত নয়";
    }

    (async () => {
        try {
            await checkStatus();
            const conversations = await loadConversations();
            const savedId = localStorage.getItem(storageKey);
            const savedExists = conversations.some(item => item.conversation_id === savedId);
            if (savedId && savedExists) await openConversation(savedId);
            else startNewConversation();
        } catch (error) {
            addMessage("error", error.message || "AI Help is unavailable.");
            chatQuestion.disabled = true;
            sendButton.disabled = true;
            if (micButton) micButton.disabled = true;
        }
    })();
});