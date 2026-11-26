"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("aiHelpSettingsForm");
    const enabled = document.getElementById("aiEnabled");
    const apiKey = document.getElementById("apiKey");
    const model = document.getElementById("aiModel");
    const message = document.getElementById("settingsMessage");
    const saveButton = document.getElementById("saveAiSettings");

    const articleList = document.getElementById("knowledgeArticleList");
    const articleForm = document.getElementById("knowledgeArticleForm");
    const articleId = document.getElementById("knowledgeArticleId");
    const categoryInput = document.getElementById("knowledgeArticleCategory");
    const titleInput = document.getElementById("knowledgeArticleTitle");
    const contentInput = document.getElementById("knowledgeArticleContent");
    const editorTitle = document.getElementById("knowledgeEditorTitle");
    const articleCount = document.getElementById("knowledgeArticleCount");
    const categoryFilter = document.getElementById("knowledgeCategoryFilter");
    const categorySuggestions = document.getElementById("knowledgeCategorySuggestions");
    const searchInput = document.getElementById("knowledgeSearch");
    const contentCount = document.getElementById("knowledgeContentCount");
    const addArticleButton = document.getElementById("addKnowledgeArticle");
    const cancelButtons = [
        document.getElementById("cancelKnowledgeEdit"),
        document.getElementById("cancelKnowledgeArticle")
    ];
    const articleSaveButton = document.getElementById("saveKnowledgeArticle");

    if (!form || !enabled || !apiKey || !model || !message ||
        !articleList || !articleForm) return;

    let savingSettings = false;
    let savingArticle = false;
    let articles = [];

    function showMessage(text, success = false) {
        message.textContent = text;
        message.className = success
            ? "ai-message ai-message-success"
            : "ai-message ai-message-error";
    }

    async function requestJson(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: {
                "Accept": "application/json",
                ...(options.headers || {})
            }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Request could not be completed.");
        }
        return data;
    }

    async function getCsrfToken() {
        const data = await requestJson("/api/csrf-token");
        if (!data.csrf_token) throw new Error("CSRF token not found.");
        return data.csrf_token;
    }

    function updateContentCount() {
        contentCount.textContent = contentInput.value.length.toLocaleString() + " / 20,000";
    }

    function closeEditor() {
        articleForm.hidden = true;
        articleForm.reset();
        articleId.value = "";
        updateContentCount();
    }

    function openEditor(article = null) {
        articleForm.hidden = false;
        articleId.value = article ? String(article.id) : "";
        categoryInput.value = article?.category || "";
        titleInput.value = article?.title || "";
        contentInput.value = article?.content || "";
        editorTitle.textContent = article ? "Edit Knowledge Article" : "Add Knowledge Article";
        articleSaveButton.textContent = article ? "Update Article" : "Save Article";
        updateContentCount();
        articleForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
        (article ? titleInput : categoryInput).focus({ preventScroll: true });
    }

    function makeButton(label, className, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = label;
        button.addEventListener("click", onClick);
        return button;
    }

    function renderCategoryOptions() {
        const selected = categoryFilter.value;
        const categories = [...new Set(
            articles.map(item => String(item.category || "").trim()).filter(Boolean)
        )].sort((a, b) => a.localeCompare(b));

        categoryFilter.replaceChildren();
        const all = document.createElement("option");
        all.value = "";
        all.textContent = "All categories";
        categoryFilter.append(all);

        categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            categoryFilter.append(option);
        });
        categoryFilter.value = categories.includes(selected) ? selected : "";

        categorySuggestions.replaceChildren();
        categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category;
            categorySuggestions.append(option);
        });
    }

    function renderArticles() {
        const query = searchInput.value.trim().toLocaleLowerCase();
        const selectedCategory = categoryFilter.value;
        const filtered = articles.filter(item => {
            const matchesCategory = !selectedCategory || item.category === selectedCategory;
            const haystack = [item.category, item.title, item.content]
                .join(" ").toLocaleLowerCase();
            return matchesCategory && (!query || haystack.includes(query));
        });

        articleCount.textContent = filtered.length + (filtered.length === 1 ? " article" : " articles");
        articleList.replaceChildren();

        if (!filtered.length) {
            const empty = document.createElement("div");
            empty.className = "ai-kb-empty";
            empty.textContent = articles.length
                ? "No articles match this search. Try another keyword or category."
                : "Your Knowledge Base is empty. Add your first verified article.";
            articleList.append(empty);
            return;
        }

        filtered.forEach(item => {
            const card = document.createElement("article");
            card.className = "ai-kb-article";

            const top = document.createElement("div");
            top.className = "ai-kb-article-top";

            const category = document.createElement("span");
            category.className = "ai-kb-category";
            category.textContent = item.category;

            const title = document.createElement("h3");
            title.textContent = item.title;
            top.append(category, title);

            const preview = document.createElement("p");
            preview.className = "ai-kb-preview";
            preview.textContent = item.content.length > 190
                ? item.content.slice(0, 190).trim() + "…"
                : item.content;

            const actions = document.createElement("div");
            actions.className = "ai-kb-article-actions";
            actions.append(
                makeButton("Edit", "ai-kb-edit", () => openEditor(item)),
                makeButton("Delete", "ai-kb-delete", () => deleteArticle(item))
            );

            card.append(top, preview, actions);
            articleList.append(card);
        });
    }

    async function loadArticles() {
        articleList.textContent = "Loading Knowledge Base…";
        const data = await requestJson("/api/ai-help/knowledge");
        articles = Array.isArray(data.items) ? data.items : [];
        renderCategoryOptions();
        renderArticles();
    }

    async function deleteArticle(article) {
        if (!window.confirm('Delete "' + article.title + '" from the Knowledge Base?')) return;
        try {
            const csrfToken = await getCsrfToken();
            await requestJson("/api/ai-help/knowledge/" + encodeURIComponent(article.id), {
                method: "DELETE",
                headers: { "X-CSRF-Token": csrfToken }
            });
            articles = articles.filter(item => String(item.id) !== String(article.id));
            renderCategoryOptions();
            renderArticles();
            showMessage("Knowledge article deleted.", true);
            if (String(articleId.value) === String(article.id)) closeEditor();
        } catch (error) {
            showMessage(error.message || "Unable to delete article.");
        }
    }

    async function loadSettings() {
        try {
            const data = await requestJson("/api/ai-help/settings");
            enabled.value = data.settings.enabled ? "1" : "0";
            model.value = data.settings.model || "openai/gpt-oss-120b";
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

            showMessage(
                data.settings.key_configured
                    ? "AI settings loaded. The saved API key is protected."
                    : "Settings loaded. Add a Groq API Key to enable AI Help.",
                true
            );
        } catch (error) {
            showMessage(error.message || "Unable to load settings.");
        }
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (savingSettings) return;
        savingSettings = true;
        saveButton.disabled = true;
        saveButton.textContent = "Saving…";

        try {
            const csrfToken = await getCsrfToken();
            const data = await requestJson("/api/ai-help/settings", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken
                },
                body: JSON.stringify({
                    enabled: enabled.value === "1",
                    model: model.value,
                    api_key: apiKey.value.trim()
                })
            });
            apiKey.value = "";
            showMessage(data.message || "AI settings saved.", true);
            await loadSettings();
        } catch (error) {
            showMessage(error.message || "Unable to save settings.");
        } finally {
            savingSettings = false;
            saveButton.disabled = false;
            saveButton.textContent = "Save Settings";
        }
    });

    articleForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (savingArticle) return;

        const payload = {
            category: categoryInput.value.trim(),
            title: titleInput.value.trim(),
            content: contentInput.value.trim()
        };
        if (!payload.category || !payload.title || !payload.content) {
            showMessage("Complete the category, title and verified instructions.", false);
            return;
        }

        savingArticle = true;
        articleSaveButton.disabled = true;
        articleSaveButton.textContent = "Saving…";
        try {
            const csrfToken = await getCsrfToken();
            const id = articleId.value;
            const data = await requestJson(
                id ? "/api/ai-help/knowledge/" + encodeURIComponent(id) : "/api/ai-help/knowledge",
                {
                    method: id ? "PUT" : "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": csrfToken
                    },
                    body: JSON.stringify(payload)
                }
            );
            closeEditor();
            await loadArticles();
            showMessage(data.message || "Knowledge article saved.", true);
        } catch (error) {
            showMessage(error.message || "Unable to save article.");
        } finally {
            savingArticle = false;
            articleSaveButton.disabled = false;
            articleSaveButton.textContent = articleId.value ? "Update Article" : "Save Article";
        }
    });

    addArticleButton.addEventListener("click", () => openEditor());
    cancelButtons.forEach(button => button?.addEventListener("click", closeEditor));
    contentInput.addEventListener("input", updateContentCount);
    searchInput.addEventListener("input", renderArticles);
    categoryFilter.addEventListener("change", renderArticles);

    Promise.all([loadSettings(), loadArticles()]).catch(error => {
        showMessage(error.message || "Unable to initialize AI Help settings.");
    });
});
