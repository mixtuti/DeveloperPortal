
/**
 * Tips Library Ver.1
 *
 * 全スクリプトのTipsを横断的に管理する。
 * 登録、編集、削除、検索、JSON保存を提供する。
 */
const DocsTips = {

    // 現在の検索条件
    filters: {
        keyword: "",
        namespace: "",
        scriptId: ""
    },

    // 表示対象のTips一覧
    entries: [],

    // JSON保存中かどうか
    isSaving: false,

    /**
     * HTMLの特殊文字をエスケープする。
     * @param {*} value 変換対象
     * @returns {string} 変換後の文字列
     */
    escape(value) {
        return DocsApp.escape(value);
    },

    /**
     * 全スクリプトを名前順に取得する。
     * @returns {Array<Object>} スクリプト一覧
     */
    getScripts() {

        return [...DocsData.getAll()].sort(
            (a, b) => a.id.localeCompare(b.id)
        );
    },

    /**
     * 全スクリプトのTipsを取得する。
     * @returns {Array<Object>} Tips一覧
     */
    getAll() {

        const results = [];

        for (const script of this.getScripts()) {

            const tips = script.tips || [];

            tips.forEach((item, index) => {

                // 旧形式の文字列データにも対応する。
                const tip = typeof item === "string"
                    ? {
                        title: "",
                        body: item
                    }
                    : item;

                if (!tip) return;

                results.push({
                    scriptId: script.id,
                    scriptName: script.name,
                    namespace: script.namespace || "(Global)",
                    index: index,
                    id: tip.id || "",
                    title: tip.title || "",
                    body: tip.body || ""
                });
            });
        }

        return results;
    },

    /**
     * Tipsの登録状況を集計する。
     * @param {Array<Object>} entries Tips一覧
     * @returns {Object} 集計結果
     */
    getStats(entries = this.getAll()) {

        return {
            tips: entries.length,

            scripts: new Set(
                entries.map(item => item.scriptId)
            ).size,

            namespaces: new Set(
                entries.map(item => item.namespace)
            ).size
        };
    },

    /**
     * 名前空間の一覧を取得する。
     * @returns {Array<string>} 名前空間一覧
     */
    getNamespaces() {

        return [...new Set(
            this.getScripts().map(
                script => script.namespace || "(Global)"
            )
        )].sort(
            (a, b) => a.localeCompare(b)
        );
    },

    /**
     * 検索条件に一致するTipsを取得する。
     * @param {Array<Object>} entries Tips一覧
     * @returns {Array<Object>} 絞り込み結果
     */
    filterEntries(entries) {

        const keywords = this.filters.keyword
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);

        return entries.filter(item => {

            // 名前空間による絞り込み
            if (
                this.filters.namespace &&
                item.namespace !== this.filters.namespace
            ) {
                return false;
            }

            // スクリプトによる絞り込み
            if (
                this.filters.scriptId &&
                item.scriptId !== this.filters.scriptId
            ) {
                return false;
            }

            // タイトル、本文、スクリプト情報を検索する。
            const searchText = [
                item.title,
                item.body,
                item.scriptName,
                item.scriptId,
                item.namespace
            ].join(" ").toLowerCase();

            return keywords.every(
                keyword => searchText.includes(keyword)
            );
        });
    },

    /**
     * Tipsページを表示する。
     */
    show() {

        DocsApp.setMain(`
            <div class="tips-library">

                <div class="tips-page-header">

                    <div>
                        <h1>Tips Library</h1>

                        <p class="muted">
                            スクリプトの活用方法や
                            開発ノウハウを管理します。
                        </p>
                    </div>

                    <button
                        type="button"
                        class="primary"
                        id="tips-add"
                    >
                        ＋ 新規登録
                    </button>

                </div>

                <div id="tips-stats"></div>

                <div class="tips-save-panel">

                    <div>
                        <strong>保存状況</strong>

                        <p id="tips-save-status"></p>

                        <p
                            class="muted"
                            id="tips-save-directory"
                        ></p>
                    </div>

                    <div class="tips-actions">

                        <button
                            type="button"
                            id="tips-select-directory"
                        >
                            フォルダ選択
                        </button>

                        <button
                            type="button"
                            class="primary"
                            id="tips-save"
                        >
                            JSON一括保存
                        </button>

                    </div>

                </div>

                <div class="tips-filter-panel">

                    <input
                        type="search"
                        id="tips-search"
                        placeholder="Tipsを検索..."
                        aria-label="Tips検索"
                        value="${this.escape(
                            this.filters.keyword
                        )}"
                    >

                    <select
                        id="tips-namespace-filter"
                        aria-label="名前空間"
                    >
                        <option value="">
                            すべての名前空間
                        </option>

                        ${this.getNamespaces().map(
                            namespace => `
                                <option
                                    value="${this.escape(namespace)}"
                                    ${namespace === this.filters.namespace
                                        ? "selected"
                                        : ""}
                                >
                                    ${this.escape(namespace)}
                                </option>
                            `
                        ).join("")}
                    </select>

                    <select
                        id="tips-script-filter"
                        aria-label="スクリプト"
                    ></select>

                    <button
                        type="button"
                        id="tips-clear-filter"
                    >
                        リセット
                    </button>

                </div>

                <p
                    class="muted"
                    id="tips-result-count"
                    aria-live="polite"
                ></p>

                <div id="tips-list"></div>

                ${this.renderEditor()}

            </div>
        `);

        this.updateScriptFilter();
        this.refresh();
        this.bind();
    },

    /**
     * Tips編集ダイアログのHTMLを生成する。
     * @returns {string} HTML
     */
    renderEditor() {

        return `
            <dialog
                id="tips-editor"
                class="tips-editor"
                aria-labelledby="tips-editor-heading"
            >

                <form id="tips-editor-form">

                    <div class="tips-editor-header">

                        <h2 id="tips-editor-heading">
                            Tipsの登録
                        </h2>

                        <button
                            type="button"
                            id="tips-editor-close"
                            aria-label="閉じる"
                        >
                            ×
                        </button>

                    </div>

                    <div class="tips-editor-body">

                        <div class="form-group">

                            <label for="tips-editor-script">
                                対象スクリプト
                            </label>

                            <select
                                id="tips-editor-script"
                                required
                            >
                                ${this.getScripts().map(
                                    script => `
                                        <option
                                            value="${this.escape(script.id)}"
                                        >
                                            ${this.escape(script.id)}
                                        </option>
                                    `
                                ).join("")}
                            </select>

                        </div>

                        <div class="form-group">

                            <label for="tips-editor-title">
                                タイトル
                            </label>

                            <input
                                type="text"
                                id="tips-editor-title"
                                placeholder="Tipsのタイトル"
                                required
                            >

                        </div>

                        <div class="form-group">

                            <label for="tips-editor-body">
                                内容
                            </label>

                            <textarea
                                id="tips-editor-body"
                                placeholder="Tipsの内容を記述してください。"
                                rows="10"
                                required
                            ></textarea>

                        </div>

                        <p
                            class="muted"
                            id="tips-editor-message"
                        ></p>

                    </div>

                    <div class="tips-editor-footer">

                        <button
                            type="button"
                            id="tips-editor-cancel"
                        >
                            キャンセル
                        </button>

                        <button
                            type="submit"
                            class="primary"
                        >
                            変更を適用
                        </button>

                    </div>

                </form>

            </dialog>
        `;
    },

    /**
     * スクリプト絞り込みの選択肢を更新する。
     */
    updateScriptFilter() {

        const select = document.getElementById(
            "tips-script-filter"
        );

        if (!select) return;

        const scripts = this.getScripts().filter(script => {

            return !this.filters.namespace ||
                (script.namespace || "(Global)") ===
                    this.filters.namespace;
        });

        // 現在の選択が絞り込み対象外なら解除する。
        if (!scripts.some(
            script => script.id === this.filters.scriptId
        )) {
            this.filters.scriptId = "";
        }

        select.innerHTML = `
            <option value="">
                すべてのスクリプト
            </option>

            ${scripts.map(script => `
                <option
                    value="${this.escape(script.id)}"
                    ${script.id === this.filters.scriptId
                        ? "selected"
                        : ""}
                >
                    ${this.escape(script.id)}
                </option>
            `).join("")}
        `;
    },

    /**
     * Tipsページの表示内容を更新する。
     */
    refresh() {

        const container =
            document.getElementById("tips-list");

        if (!container) return;

        // 検索時に再解析を行わないよう、
        // 現在の登録済みデータだけを取得する。
        this.entries = this.getAll();

        this.renderStats();
        this.renderList();
        this.renderSaveStatus();
    },

    /**
     * 統計情報を表示する。
     */
    renderStats() {

        const container =
            document.getElementById("tips-stats");

        if (!container) return;

        const stats = this.getStats(this.entries);

        container.innerHTML = `
            <div class="tips-stats-grid">

                ${this.renderStatCard(
                    "登録Tips",
                    stats.tips
                )}

                ${this.renderStatCard(
                    "登録スクリプト",
                    stats.scripts
                )}

                ${this.renderStatCard(
                    "名前空間",
                    stats.namespaces
                )}

            </div>
        `;
    },

    /**
     * 統計カードを生成する。
     * @param {string} label 表示名
     * @param {number} value 集計値
     * @returns {string} HTML
     */
    renderStatCard(label, value) {

        return `
            <div class="tips-stat-card">

                <div class="tips-stat-label">
                    ${this.escape(label)}
                </div>

                <div class="tips-stat-value">
                    ${value}
                </div>

            </div>
        `;
    },

    /**
     * Tips一覧を表示する。
     */
    renderList() {

        const container =
            document.getElementById("tips-list");

        if (!container) return;

        const filtered =
            this.filterEntries(this.entries);

        document.getElementById(
            "tips-result-count"
        ).textContent =
            `${filtered.length} / ${this.entries.length}件`;

        if (!filtered.length) {

            container.innerHTML = `
                <div class="tips-empty">

                    <h3>
                        ${this.entries.length
                            ? "一致するTipsがありません"
                            : "Tipsが登録されていません"}
                    </h3>

                    <p class="muted">
                        ${this.entries.length
                            ? "検索条件を変更してください。"
                            : "新規登録からTipsを追加できます。"}
                    </p>

                </div>
            `;

            this.renderOutline([]);
            return;
        }

        // スクリプト単位でTipsをグループ化する。
        const groups = new Map();

        for (const item of filtered) {

            if (!groups.has(item.scriptId)) {
                groups.set(item.scriptId, []);
            }

            groups.get(item.scriptId).push(item);
        }

        const groupList = [...groups.values()];

        container.innerHTML = groupList.map(
            (items, index) =>
                this.renderGroup(items, index)
        ).join("");

        this.renderOutline(groupList);
    },

    /**
     * スクリプト単位のTips一覧を生成する。
     * @param {Array<Object>} items Tips一覧
     * @param {number} index グループ番号
     * @returns {string} HTML
     */
    renderGroup(items, index) {

        const first = items[0];

        return `
            <section
                class="tips-group"
                id="tips-group-${index}"
            >

                <div class="tips-group-header">

                    <div>

                        <h2>
                            <a href="#script/${this.escape(
                                encodeURIComponent(first.scriptId)
                            )}">
                                ${this.escape(first.scriptName)}
                            </a>
                        </h2>

                        <p class="muted">
                            ${this.escape(first.namespace)}
                        </p>

                    </div>

                    <span class="tips-count">
                        ${items.length}件
                    </span>

                </div>

                <div class="tips-group-items">

                    ${items.map(
                        item => this.renderCard(item)
                    ).join("")}

                </div>

            </section>
        `;
    },

    /**
     * 個別のTipsカードを生成する。
     * @param {Object} item Tips情報
     * @returns {string} HTML
     */
    renderCard(item) {

        return `
            <article
                class="tips-card"
                data-script-id="${this.escape(item.scriptId)}"
                data-tip-index="${item.index}"
                data-tip-id="${this.escape(item.id)}"
            >

                <div class="tips-card-header">

                    <h3>
                        <span class="tips-icon">💡</span>

                        ${this.escape(
                            item.title || "タイトルなし"
                        )}
                    </h3>

                    <div class="tips-actions">

                        <button
                            type="button"
                            data-tip-action="edit"
                        >
                            編集
                        </button>

                        <button
                            type="button"
                            class="tips-delete-button"
                            data-tip-action="delete"
                        >
                            削除
                        </button>

                    </div>

                </div>

                <div class="tips-card-body">${this.escape(item.body)}</div>

            </article>
        `;
    },

    /**
     * 右サイドバーの目次を生成する。
     * @param {Array<Array<Object>>} groups グループ一覧
     */
    renderOutline(groups) {

        const outline =
            document.getElementById("outline");

        if (!outline) return;

        outline.innerHTML = `
            <div class="tips-outline">

                ${groups.map((items, index) => `
                    <button
                        type="button"
                        data-tips-target="tips-group-${index}"
                    >
                        <span>
                            ${this.escape(
                                items[0].scriptName
                            )}
                        </span>

                        <small>${items.length}</small>
                    </button>
                `).join("")}

            </div>
        `;

        outline.querySelectorAll("[data-tips-target]")
            .forEach(button => {

                button.addEventListener("click", () => {

                    document.getElementById(
                        button.dataset.tipsTarget
                    )?.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                });
            });
    },

    /**
     * JSONの保存状況を表示する。
     */
    renderSaveStatus() {

        const status =
            document.getElementById("tips-save-status");

        const directory =
            document.getElementById("tips-save-directory");

        const saveButton =
            document.getElementById("tips-save");

        const selectButton =
            document.getElementById("tips-select-directory");

        if (!status || !directory) return;

        const isDirty =
            DocsData.isDirty ||
            DocsAssetManager.isDirty;

        status.className =
            isDirty ? "warning" : "success";

        status.textContent = this.isSaving
            ? "JSONを保存しています..."
            : isDirty
                ? "未保存の変更があります"
                : "未保存の変更はありません";

        directory.textContent =
            "保存先：" +
            (
                DocsExporter.rootHandle?.name ||
                "未選択"
            );

        if (saveButton) {
            saveButton.disabled = this.isSaving;
        }

        if (selectButton) {
            selectButton.disabled = this.isSaving;
        }
    },

    /**
     * 編集対象のTipsを取得する。
     * IDが存在する場合はIDを優先する。
     *
     * @param {string} scriptId スクリプトID
     * @param {number} index Tipsの位置
     * @param {string} tipId TipsのID
     * @returns {Object|null} 対象Tips
     */
    findEntry(scriptId, index, tipId = "") {

        const entries = this.getAll().filter(
            item => item.scriptId === scriptId
        );

        return entries.find(item =>
            tipId
                ? item.id === tipId
                : item.index === index
        ) || null;
    },

    /**
     * 新規登録または編集ダイアログを開く。
     * @param {Object|null} entry 編集対象Tips
     */
    openEditor(entry = null) {

        const scripts = this.getScripts();

        if (!scripts.length) {

            DocsApp.notify(
                "先にC#スクリプトを登録してください。"
            );

            return;
        }

        const dialog =
            document.getElementById("tips-editor");

        const form =
            document.getElementById("tips-editor-form");

        const scriptSelect =
            document.getElementById("tips-editor-script");

        const title =
            document.getElementById("tips-editor-title");

        const body =
            document.getElementById("tips-editor-body");

        const heading =
            document.getElementById("tips-editor-heading");

        const message =
            document.getElementById("tips-editor-message");

        form.reset();

        // 編集対象をフォームに保持する。
        form.dataset.mode = entry ? "edit" : "create";

        form.dataset.scriptId =
            entry?.scriptId || "";

        form.dataset.tipId =
            entry?.id || "";

        form.dataset.tipIndex =
            entry ? String(entry.index) : "-1";

        heading.textContent =
            entry ? "Tipsの編集" : "Tipsの新規登録";

        scriptSelect.value =
            entry?.scriptId ||
            this.filters.scriptId ||
            scripts.find(script =>
                (script.namespace || "(Global)") ===
                    this.filters.namespace
            )?.id ||
            scripts[0].id;

        // 編集時の所属スクリプト変更は行わない。
        scriptSelect.disabled = Boolean(entry);

        title.value = entry?.title || "";
        body.value = entry?.body || "";

        message.textContent =
            "変更を適用した後、JSON一括保存を行ってください。";

        dialog.showModal();
        title.focus();
    },

    /**
     * Tips編集ダイアログを閉じる。
     */
    closeEditor() {

        document.getElementById(
            "tips-editor"
        )?.close();
    },

    /**
     * Tipsの登録・編集内容を反映する。
     * @param {HTMLFormElement} form 編集フォーム
     */
    applyEditor(form) {

        const isEdit =
            form.dataset.mode === "edit";

        const scriptId = isEdit
            ? form.dataset.scriptId
            : document.getElementById(
                "tips-editor-script"
            ).value;

        const title = document.getElementById(
            "tips-editor-title"
        ).value.trim();

        const body = document.getElementById(
            "tips-editor-body"
        ).value.trim();

        const message = document.getElementById(
            "tips-editor-message"
        );

        if (!scriptId || !title || !body) {

            message.textContent =
                "すべての項目を入力してください。";

            return;
        }

        try {

            // Tips以外の補完情報も含めて取得する。
            const draft = DocsManager.get(scriptId);

            if (isEdit) {

                const entry = this.findEntry(
                    scriptId,
                    Number(form.dataset.tipIndex),
                    form.dataset.tipId
                );

                if (!entry || !draft.tips[entry.index]) {
                    throw new Error(
                        "編集対象のTipsが見つかりません。"
                    );
                }

                // 既存のIDを維持して内容だけ変更する。
                draft.tips[entry.index] = {
                    ...draft.tips[entry.index],
                    title: title,
                    body: body
                };
            }
            else {

                draft.tips.push({
                    ...DocsManager.createItem(),
                    title: title,
                    body: body
                });
            }

            // 他の補完情報を維持したまま更新する。
            DocsManager.save(scriptId, draft);

            this.closeEditor();

            // 登録したTipsが検索条件で隠れないようにする。
            const script = DocsData.getById(scriptId);

            this.filters.keyword = "";
            this.filters.namespace =
                script.namespace || "(Global)";

            this.filters.scriptId = scriptId;

            document.getElementById(
                "tips-search"
            ).value = "";

            document.getElementById(
                "tips-namespace-filter"
            ).value = this.filters.namespace;

            this.updateScriptFilter();
            this.refresh();

            DocsApp.renderStatus();

            DocsApp.notify(
                isEdit
                    ? "Tipsを更新しました。"
                    : "Tipsを登録しました。"
            );
        }
        catch (error) {

            message.textContent = error.message;
            console.error(error);
        }
    },

    /**
     * 指定されたTipsを削除する。
     * @param {Object} entry 削除対象Tips
     */
    remove(entry) {

        const confirmed = window.confirm(
            `「${entry.title || "タイトルなし"}」を削除しますか？`
        );

        if (!confirmed) return;

        try {

            const current = this.findEntry(
                entry.scriptId,
                entry.index,
                entry.id
            );

            if (!current) {
                throw new Error(
                    "削除対象のTipsが見つかりません。"
                );
            }

            const draft = DocsManager.get(
                current.scriptId
            );

            draft.tips.splice(current.index, 1);

            DocsManager.save(
                current.scriptId,
                draft
            );

            this.refresh();

            DocsApp.renderStatus();
            DocsApp.notify("Tipsを削除しました。");
        }
        catch (error) {

            DocsApp.notify(error.message);
            console.error(error);
        }
    },

    /**
     * JSONの保存先フォルダを選択する。
     */
    async selectDirectory() {

        if (this.isSaving) return;

        try {

            await DocsExporter.selectDirectory();

            this.renderSaveStatus();

            DocsApp.notify(
                "保存先フォルダを選択しました。"
            );
        }
        catch (error) {

            if (error.name !== "AbortError") {
                DocsApp.notify(error.message);
            }
        }
    },

    /**
     * 登録済みデータをJSONファイルへ保存する。
     * 既存の一括保存機能を再利用する。
     */
    async save() {

        if (this.isSaving) return;

        this.isSaving = true;
        this.renderSaveStatus();

        try {

            if (!DocsExporter.rootHandle) {

                // 保存先が未選択の場合は選択画面を開く。
                await DocsExporter.selectDirectory();
            }

            const count = await DocsExporter.exportAll();

            DocsApp.renderStatus();

            DocsApp.notify(
                `${count}件のスクリプトを保存しました。`
            );
        }
        catch (error) {

            DocsApp.notify(
                error.name === "AbortError"
                    ? "保存をキャンセルしました。"
                    : `保存に失敗しました：${error.message}`
            );

            if (error.name !== "AbortError") {
                console.error(error);
            }
        }
        finally {

            this.isSaving = false;
            this.renderSaveStatus();
        }
    },

    /**
     * Tipsページのイベントを登録する。
     */
    bind() {

        const search =
            document.getElementById("tips-search");

        const namespaceFilter =
            document.getElementById(
                "tips-namespace-filter"
            );

        const scriptFilter =
            document.getElementById(
                "tips-script-filter"
            );

        // キーワード検索
        search.addEventListener("input", () => {

            this.filters.keyword = search.value;
            this.renderList();
        });

        // 名前空間による絞り込み
        namespaceFilter.addEventListener("change", () => {

            this.filters.namespace =
                namespaceFilter.value;

            this.filters.scriptId = "";

            this.updateScriptFilter();
            this.renderList();
        });

        // スクリプトによる絞り込み
        scriptFilter.addEventListener("change", () => {

            this.filters.scriptId =
                scriptFilter.value;

            this.renderList();
        });

        // 検索条件のリセット
        document.getElementById(
            "tips-clear-filter"
        ).onclick = () => {

            this.filters = {
                keyword: "",
                namespace: "",
                scriptId: ""
            };

            search.value = "";
            namespaceFilter.value = "";

            this.updateScriptFilter();
            this.renderList();
        };

        // 新規登録
        document.getElementById(
            "tips-add"
        ).onclick = () => {

            this.openEditor();
        };

        // 編集ダイアログを閉じる。
        document.getElementById(
            "tips-editor-close"
        ).onclick = () => {

            this.closeEditor();
        };

        document.getElementById(
            "tips-editor-cancel"
        ).onclick = () => {

            this.closeEditor();
        };

        // 編集内容を適用する。
        document.getElementById(
            "tips-editor-form"
        ).onsubmit = event => {

            event.preventDefault();

            this.applyEditor(event.currentTarget);
        };

        // Tipsカードの編集・削除を処理する。
        document.getElementById(
            "tips-list"
        ).onclick = event => {

            const button = event.target.closest(
                "[data-tip-action]"
            );

            if (!button) return;

            const card = button.closest(".tips-card");

            if (!card) return;

            const entry = this.findEntry(
                card.dataset.scriptId,
                Number(card.dataset.tipIndex),
                card.dataset.tipId
            );

            if (!entry) {

                DocsApp.notify(
                    "対象のTipsが見つかりません。"
                );

                this.refresh();
                return;
            }

            switch (button.dataset.tipAction) {

                case "edit":
                    this.openEditor(entry);
                    break;

                case "delete":
                    this.remove(entry);
                    break;
            }
        };

        // 保存先フォルダの選択
        document.getElementById(
            "tips-select-directory"
        ).onclick = () => {

            this.selectDirectory();
        };

        // JSONへの直接保存
        document.getElementById(
            "tips-save"
        ).onclick = () => {

            this.save();
        };
    }
};
