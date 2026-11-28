
/**
 * コーディングガイド管理システム Ver.1
 *
 * C#解析仕様、推奨記述、対応状況を
 * JSONデータから取得して表示する。
 */
const DocsCodingGuide = {

    // ガイドデータの保存先
    dataPath: "data/coding-guide.json",

    // 読み込み済みガイドデータ
    data: null,

    // 読み込み中のPromise
    loadingPromise: null,

    // ページ表示要求の識別番号
    requestId: 0,

    // 対応状況の表示定義
    statuses: {
        supported: {
            label: "対応",
            className: "supported"
        },
        partial: {
            label: "部分対応",
            className: "partial"
        },
        unsupported: {
            label: "未対応",
            className: "unsupported"
        },
        recommended: {
            label: "推奨記述",
            className: "recommended"
        }
    },

    /**
     * HTMLの特殊文字をエスケープする。
     * @param {*} value 変換対象
     * @returns {string} 変換後の文字列
     */
    escape(value) {
        return DocsApp.escape(value);
    },

    /**
     * ガイドデータを読み込む。
     * 読み込み済みの場合はキャッシュを利用する。
     *
     * @returns {Promise<Object>} ガイドデータ
     */
    async load() {

        if (this.data) {
            return this.data;
        }

        // 同時に複数回読み込まないようにする。
        if (!this.loadingPromise) {

            this.loadingPromise = (async () => {

                const response = await fetch(
                    this.dataPath,
                    { cache: "no-cache" }
                );

                if (!response.ok) {
                    throw new Error(
                        `ガイドの読み込みに失敗しました。HTTP ${response.status}`
                    );
                }

                const data = await response.json();

                // 基本的なデータ構造を確認する。
                if (
                    data.schemaVersion !== 1 ||
                    !Array.isArray(data.sections)
                ) {
                    throw new Error(
                        "ガイドデータの形式が無効です。"
                    );
                }

                this.data = data;

                return data;

            })();
        }

        try {
            return await this.loadingPromise;
        }
        finally {
            this.loadingPromise = null;
        }
    },

    /**
     * コーディングガイドページを表示する。
     */
    async show() {

        const requestId = ++this.requestId;

        DocsApp.setMain(`
            <h1>Coding Guide</h1>
            <p class="muted">
                ガイドを読み込んでいます。
            </p>
        `);

        // 非同期読み込み中に別ページへ移動した場合、
        // 古い表示要求で画面を上書きしないようにする。
        const loadingElement =
            document.getElementById("main").firstElementChild;

        const isCurrent = () =>
            requestId === this.requestId &&
            location.hash === "#coding-guide" &&
            loadingElement.isConnected;

        try {

            const data = await this.load();

            if (!isCurrent()) return;

            DocsApp.setMain(
                this.render(data)
            );

            const main = document.getElementById("main");

            this.bind(main);
            this.renderOutline(main);
        }
        catch (error) {

            if (!isCurrent()) return;

            DocsApp.setMain(`
                <h1>Coding Guide</h1>

                <div class="card">
                    <p class="danger">
                        ${this.escape(error.message)}
                    </p>

                    <button
                        type="button"
                        class="button"
                        id="guide-retry"
                    >
                        再読み込み
                    </button>
                </div>
            `);

            document.getElementById("guide-retry")
                ?.addEventListener("click", () => {
                    this.show();
                });

            console.error(error);
        }
    },

    /**
     * ガイド全体のHTMLを生成する。
     * @param {Object} data ガイドデータ
     * @returns {string} HTML
     */
    render(data) {

        const rules = data.sections.flatMap(
            section => section.rules || []
        );

        const stats = this.getStats(rules);

        const currentParserVersion =
            String(DocsParser.version);

        const versionMismatch =
            String(data.parserVersion) !==
            currentParserVersion;

        return `
            <div class="coding-guide">

                <header class="guide-header">

                    <h1>${this.escape(data.title)}</h1>

                    <div class="guide-version-list">

                        <span class="guide-version">
                            Guide Ver.${this.escape(data.version)}
                        </span>

                        <span class="guide-version">
                            Parser Ver.${this.escape(data.parserVersion)}
                        </span>

                    </div>

                    <p>
                        ${this.escape(data.description)}
                    </p>

                </header>

                ${versionMismatch ? `
                    <div class="guide-warning">
                        ガイドと現在のパーサーの
                        バージョンが異なります。
                        現在のParser：
                        ${this.escape(currentParserVersion)}
                    </div>
                ` : ""}

                <div class="guide-notice">

                    <strong>解析仕様について</strong>

                    <p>
                        本ガイドはDeveloper Portalの
                        静的解析仕様を説明するものです。
                        C#の構文やUnityの動作を
                        完全に保証するものではありません。
                    </p>

                </div>

                ${this.renderStats(stats)}

                <div class="guide-toolbar">

                    <input
                        type="search"
                        id="guide-search"
                        placeholder="ガイド内を検索..."
                        aria-label="ガイド内検索"
                    >

                    <select
                        id="guide-status-filter"
                        aria-label="対応状況"
                    >
                        <option value="all">
                            すべての対応状況
                        </option>

                        ${Object.entries(this.statuses)
                            .map(([key, status]) => `
                                <option value="${key}">
                                    ${this.escape(status.label)}
                                </option>
                            `).join("")}
                    </select>

                </div>

                <p
                    class="muted"
                    id="guide-result-count"
                    aria-live="polite"
                >
                    ${rules.length}項目
                </p>

                <div
                    id="guide-empty"
                    class="guide-notice"
                    hidden
                >
                    条件に一致する項目がありません。
                </div>

                <div id="guide-sections">

                    ${data.sections.map(
                        (section, index) =>
                            this.renderSection(section, index)
                    ).join("")}

                </div>

            </div>
        `;
    },

    /**
     * 対応状況ごとの項目数を集計する。
     * @param {Array<Object>} rules ルール一覧
     * @returns {Object} 集計結果
     */
    getStats(rules) {

        const stats = {
            total: rules.length,
            supported: 0,
            partial: 0,
            unsupported: 0,
            recommended: 0
        };

        for (const rule of rules) {

            if (Object.hasOwn(this.statuses, rule.status)) {
                stats[rule.status]++;
            }
        }

        return stats;
    },

    /**
     * 統計情報のHTMLを生成する。
     * @param {Object} stats 集計結果
     * @returns {string} HTML
     */
    renderStats(stats) {

        const items = [
            {
                label: "全項目",
                value: stats.total,
                className: "total"
            },
            ...Object.entries(this.statuses).map(
                ([key, status]) => ({
                    label: status.label,
                    value: stats[key],
                    className: status.className
                })
            )
        ];

        return `
            <div class="guide-stats">

                ${items.map(item => `
                    <div class="guide-stat-card">

                        <div class="guide-stat-label">
                            ${this.escape(item.label)}
                        </div>

                        <div class="guide-stat-value ${item.className}">
                            ${item.value}
                        </div>

                    </div>
                `).join("")}

            </div>
        `;
    },

    /**
     * カテゴリ単位のHTMLを生成する。
     * @param {Object} section カテゴリ情報
     * @param {number} index カテゴリ番号
     * @returns {string} HTML
     */
    renderSection(section, index) {

        const id = `guide-section-${index}`;

        return `
            <section
                class="guide-section"
                id="${id}"
            >

                <h2>
                    ${this.escape(section.title)}
                </h2>

                <p class="guide-section-description">
                    ${this.escape(section.description)}
                </p>

                <div class="guide-rule-list">

                    ${(section.rules || []).map(
                        rule => this.renderRule(rule)
                    ).join("")}

                </div>

            </section>
        `;
    },

    /**
     * 個別ルールのHTMLを生成する。
     * @param {Object} rule ルール情報
     * @returns {string} HTML
     */
    renderRule(rule) {

        const status = Object.hasOwn(
            this.statuses,
            rule.status
        )
            ? this.statuses[rule.status]
            : {
                label: "未分類",
                className: "unsupported"
            };

        return `
            <article
                class="guide-rule"
                data-guide-status="${status.className}"
            >

                <div class="guide-rule-header">

                    <h3>${this.escape(rule.title)}</h3>

                    <span class="guide-badge ${status.className}">
                        ${this.escape(status.label)}
                    </span>

                </div>

                <p class="guide-rule-description">
                    ${this.escape(rule.description)}
                </p>

                ${rule.code
                    ? this.renderCode(
                        rule.code,
                        "記述例"
                    )
                    : ""
                }

                ${rule.badCode
                    ? this.renderCode(
                        rule.badCode,
                        "解析非推奨の記述",
                        true
                    )
                    : ""
                }

                ${rule.result ? `
                    <div class="guide-result">

                        <div class="guide-result-title">
                            解析・表示結果の例
                        </div>

                        <div class="guide-result-body">
                            ${this.escape(rule.result)}
                        </div>

                    </div>
                ` : ""}

            </article>
        `;
    },

    /**
     * コードサンプルのHTMLを生成する。
     * @param {string} code ソースコード
     * @param {string} label 表示名
     * @param {boolean} warning 非推奨記述か
     * @returns {string} HTML
     */
    renderCode(code, label, warning = false) {

        return `
            <div class="guide-code-block ${warning ? "is-warning" : ""}">

                <div class="guide-code-header">

                    <span>
                        ${this.escape(label)}
                    </span>

                    <button
                        type="button"
                        class="guide-copy-button"
                        data-guide-copy
                    >
                        コピー
                    </button>

                </div>

                <pre><code>${this.escape(code)}</code></pre>

            </div>
        `;
    },

    /**
     * 検索と対応状況フィルターを適用する。
     * @param {HTMLElement} container 表示領域
     */
    applyFilters(container) {

        const keyword = (
            container.querySelector("#guide-search")
                ?.value || ""
        ).trim().toLowerCase();

        const selectedStatus =
            container.querySelector("#guide-status-filter")
                ?.value || "all";

        // 複数のキーワードをAND条件で検索する。
        const keywords = keyword
            .split(/\s+/)
            .filter(Boolean);

        let visibleCount = 0;

        container.querySelectorAll(".guide-section")
            .forEach(section => {

                let sectionCount = 0;

                const sectionTitle =
                    section.querySelector("h2")
                        ?.textContent || "";

                const sectionDescription =
                    section.querySelector(
                        ".guide-section-description"
                    )?.textContent || "";

                section.querySelectorAll(".guide-rule")
                    .forEach(rule => {

                        const searchText = [
                            sectionTitle,
                            sectionDescription,
                            rule.textContent
                        ].join(" ").toLowerCase();

                        const matchesKeyword =
                            keywords.every(
                                word => searchText.includes(word)
                            );

                        const matchesStatus =
                            selectedStatus === "all" ||
                            rule.dataset.guideStatus ===
                                selectedStatus;

                        const visible =
                            matchesKeyword && matchesStatus;

                        rule.hidden = !visible;

                        if (visible) {
                            sectionCount++;
                            visibleCount++;
                        }
                    });

                section.hidden = sectionCount === 0;
            });

        container.querySelector("#guide-result-count")
            .textContent = `${visibleCount}項目`;

        container.querySelector("#guide-empty")
            .hidden = visibleCount !== 0;

        // 絞り込み後の目次を更新する。
        this.renderOutline(container);
    },

    /**
     * 右サイドバーに目次を生成する。
     * @param {HTMLElement} container 表示領域
     */
    renderOutline(container) {

        const outline =
            document.getElementById("outline");

        if (!outline) return;

        const sections = [
            ...container.querySelectorAll(".guide-section")
        ].filter(section => !section.hidden);

        outline.innerHTML = `
            <div class="guide-outline">

                ${sections.map(section => `
                    <button
                        type="button"
                        data-guide-target="${section.id}"
                    >
                        ${this.escape(
                            section.querySelector("h2")
                                ?.textContent || ""
                        )}
                    </button>
                `).join("")}

            </div>
        `;

        outline.querySelectorAll("[data-guide-target]")
            .forEach(button => {

                button.addEventListener("click", () => {

                    const target = document.getElementById(
                        button.dataset.guideTarget
                    );

                    target?.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                });
            });
    },

    /**
     * コードサンプルをクリップボードにコピーする。
     * @param {HTMLButtonElement} button コピーボタン
     */
    async copyCode(button) {

        const code = button
            .closest(".guide-code-block")
            ?.querySelector("code")
            ?.textContent;

        if (code == null) return;

        try {

            await navigator.clipboard.writeText(code);

            DocsApp.notify(
                "コードをコピーしました。"
            );
        }
        catch (error) {

            DocsApp.notify(
                "コピーに失敗しました。"
            );

            console.error(error);
        }
    },

    /**
     * ガイドページのイベントを登録する。
     * @param {HTMLElement} container 表示領域
     */
    bind(container) {

        const search =
            container.querySelector("#guide-search");

        const filter =
            container.querySelector("#guide-status-filter");

        search?.addEventListener("input", () => {
            this.applyFilters(container);
        });

        filter?.addEventListener("change", () => {
            this.applyFilters(container);
        });

        container.querySelectorAll("[data-guide-copy]")
            .forEach(button => {

                button.addEventListener("click", () => {
                    this.copyCode(button);
                });
            });
    }
};
