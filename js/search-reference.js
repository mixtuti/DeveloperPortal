
/**
 * グローバル検索画面
 *
 * 検索結果の描画、ハイライト、
 * カテゴリの切り替えを担当する。
 */
const DocsSearchReference = {

    // 現在の検索結果
    current: null,

    // 選択中のカテゴリ
    category: "all",

    // 入力待機用タイマー
    timer: null,

    // 一度に表示する最大件数
    displayLimit: 100,

    // 検索結果のカテゴリ
    categories: [
        { id: "all", label: "すべて" },
        { id: "script", label: "Script" },
        { id: "api", label: "API" },
        { id: "tip", label: "Tips" },
        { id: "example", label: "使用例" },
        { id: "note", label: "注意事項" },
        { id: "related", label: "関連" },
        { id: "test", label: "Test" },
        { id: "asset", label: "Asset" }
    ],

    // 一致箇所の表示名
    fieldLabels: {
        title: "名前・タイトル",
        namespace: "名前空間",
        owner: "所属",
        summary: "概要",
        body: "本文・詳細情報",
        source: "ソースコード"
    },

    /**
     * HTMLの特殊文字をエスケープする。
     * @param {*} value 変換対象
     * @returns {string} HTML文字列
     */
    escape(value) {
        return DocsApp.escape(value);
    },

    /**
     * 正規表現の特殊文字をエスケープする。
     * @param {string} value 変換対象
     * @returns {string} 変換結果
     */
    escapeRegex(value) {

        return value.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
    },

    /**
     * キーワードをハイライトする。
     *
     * HTMLのエスケープを行ったうえで、
     * 一致箇所にmarkタグを追加する。
     *
     * @param {string} text 対象文章
     * @param {Array<string>} keywords キーワード一覧
     * @returns {string} HTML
     */
    highlight(text, keywords) {

        const value = String(text ?? "");

        const words = [...new Set(keywords)]
            .filter(Boolean)
            .sort((a, b) => b.length - a.length);

        if (!words.length) {
            return this.escape(value);
        }

        const pattern = new RegExp(
            words.map(
                word => this.escapeRegex(word)
            ).join("|"),
            "gi"
        );

        let html = "";
        let lastIndex = 0;

        // 元の文字列上で一致箇所を検出する。
        for (const match of value.matchAll(pattern)) {

            html += this.escape(
                value.slice(lastIndex, match.index)
            );

            html +=
                `<mark class="search-highlight">` +
                this.escape(match[0]) +
                `</mark>`;

            lastIndex =
                match.index + match[0].length;
        }

        html += this.escape(
            value.slice(lastIndex)
        );

        return html;
    },

    /**
     * 保留中の検索をキャンセルする。
     */
    cancelPending() {

        clearTimeout(this.timer);
        this.timer = null;
    },

    /**
     * 検索入力を処理する。
     *
     * 連続入力時の検索処理を抑制するため、
     * デバウンスを使用する。
     *
     * @param {string} query 検索文字列
     */
    schedule(query) {

        this.cancelPending();

        const value = query.trim();

        if (!value) {

            this.current = null;
            this.category = "all";

            DocsApp.renderPage();
            return;
        }

        this.timer = setTimeout(() => {

            this.timer = null;
            this.show(value);

        }, 150);
    },

    /**
     * 検索結果ページを表示する。
     * @param {string} query 検索文字列
     */
    show(query) {

        this.cancelPending();

        this.current =
            DocsSearchEngine.search(query);

        this.category = "all";
        this.displayLimit = 100;

        // 前のページの目次や関連情報を解除する。
        document.getElementById(
            "outline"
        )?.replaceChildren();

        document.getElementById(
            "related"
        )?.replaceChildren();

        document.querySelectorAll("#nav a")
            .forEach(link =>
                link.classList.remove("active")
            );

        DocsApp.setMain(`

            <div class="global-search">

                <h1>検索結果</h1>

                <p class="muted">
                    スクリプト、API、Tips、
                    使用例などを横断検索します。
                </p>

                <details class="search-help">

                    <summary>検索構文</summary>

                    <div class="search-help-grid">

                        <code>#Camera</code>
                        <span>スクリプト</span>

                        <code>@Fit</code>
                        <span>API</span>

                        <code>tip:カメラ</code>
                        <span>Tips</span>

                        <code>example:padding</code>
                        <span>使用例</span>

                        <code>asset:Easy</code>
                        <span>外部アセット</span>

                        <code>ns:Framework</code>
                        <span>名前空間</span>

                        <code>"Easy Save"</code>
                        <span>フレーズ検索</span>

                    </div>

                </details>

                <div id="global-search-filters"></div>

                <p
                    id="global-search-count"
                    class="muted"
                    aria-live="polite"
                ></p>

                <div id="global-search-results"></div>

            </div>
        `);

        this.renderFilters();
        this.renderResults();
        this.bind();
    },

    /**
     * 指定カテゴリの検索結果を取得する。
     * @param {string} category カテゴリ
     * @returns {Array<Object>} 検索結果
     */
    getResults(category = this.category) {

        return (this.current?.results || [])
            .filter(item =>

                DocsSearchEngine.matchesCategory(
                    item.kind,
                    category
                )
            );
    },

    /**
     * カテゴリフィルターを表示する。
     */
    renderFilters() {

        const container = document.getElementById(
            "global-search-filters"
        );

        if (!container) return;

        container.innerHTML = `

            <div class="search-filter-bar">

                ${this.categories.map(category => {

                    const count =
                        this.getResults(category.id).length;

                    const active =
                        category.id === this.category;

                    return `
                        <button
                            type="button"
                            class="search-filter
                                ${active ? "active" : ""}"
                            data-search-category="${category.id}"
                            aria-pressed="${active}"
                        >
                            ${this.escape(category.label)}

                            <span class="search-filter-count">
                                ${count}
                            </span>
                        </button>
                    `;

                }).join("")}

            </div>
        `;
    },

    /**
     * 検索結果一覧を表示する。
     */
    renderResults() {

        const container = document.getElementById(
            "global-search-results"
        );

        const count = document.getElementById(
            "global-search-count"
        );

        if (!container || !count) return;

        const results = this.getResults();

        count.textContent =
            `「${this.current.query}」：` +
            `${results.length}件`;

        if (!results.length) {

            container.innerHTML = `
                <div class="search-empty">

                    <h3>一致する項目がありません</h3>

                    <p class="muted">
                        キーワードや検索条件を
                        変更してください。
                    </p>

                </div>
            `;

            return;
        }

        const visible = results.slice(
            0,
            this.displayLimit
        );

        container.innerHTML = `

            <div class="search-result-list">

                ${visible.map(
                    item => this.renderCard(item)
                ).join("")}

            </div>

            ${results.length > visible.length ? `
                <div class="search-more">

                    <p class="muted">
                        ${visible.length} /
                        ${results.length}件を表示
                    </p>

                    <button
                        type="button"
                        data-search-more
                    >
                        さらに表示
                    </button>

                </div>
            ` : ""}
        `;
    },

    /**
     * 個別の検索結果を描画する。
     * @param {Object} item 検索結果
     * @returns {string} HTML
     */
    renderCard(item) {

        const kind = DocsSearchIndex.kinds[item.kind];

        const keywords =
            this.current.conditions.keywords;

        const context = [
            item.namespace,
            item.owner
        ].filter(Boolean).join(" / ");

        const matchedFields = item.matches.map(
            field => this.fieldLabels[field]
        );

        // 概要を優先して表示する。
        const summary = DocsSearchEngine.createSnippet(
            item.summary,
            keywords
        );

        // 本文やソース内で一致した場合は、
        // 一致箇所の抜粋を追加する。
        let detail = "";

        if (item.matches.includes("body")) {

            detail = DocsSearchEngine.createSnippet(
                item.body,
                keywords
            );
        }

        else if (item.matches.includes("source")) {

            detail = DocsSearchEngine.createSnippet(
                item.source,
                keywords
            );
        }

        else if (!summary && item.body) {

            detail = DocsSearchEngine.createSnippet(
                item.body,
                keywords
            );
        }

        return `

            <article class="search-result-card">

                <div class="search-result-header">

                    <span class="search-kind-icon
                        search-kind-${this.escape(item.kind)}"
                        aria-hidden="true"
                    >${this.escape(kind.symbol)}</span>

                    <div class="search-result-heading">

                        <a
                            class="search-result-title"
                            href="#${this.escape(item.route)}"
                            data-search-route="${this.escape(item.route)}"
                        >${this.highlight(item.title, keywords)}</a>

                        ${context ? `
                            <div class="search-result-context"
                            >${this.highlight(context, keywords)}</div>
                        ` : ""}

                    </div>

                    <span class="search-kind-label">
                        ${this.escape(kind.label)}
                    </span>

                </div>

                ${summary ? `
                    <div class="search-result-summary"
                    >${this.highlight(summary, keywords)}</div>
                ` : ""}

                ${detail && detail !== summary ? `
                    <div class="search-result-snippet"
                    >${this.highlight(detail, keywords)}</div>
                ` : ""}

                ${matchedFields.length ? `
                    <div class="search-result-matches">
                        一致箇所：
                        ${this.escape(matchedFields.join("・"))}
                    </div>
                ` : ""}

            </article>
        `;
    },

    /**
     * 検索結果のリンク先へ移動する。
     * @param {string} route 移動先
     */
    navigate(route) {

        this.cancelPending();

        // 検索欄をクリアして通常表示に戻す。
        document.getElementById("search").value = "";

        this.current = null;
        this.category = "all";

        // 現在と同じURLの場合も再描画する。
        if (location.hash === `#${route}`) {

            DocsApp.renderPage();
        }

        else {

            location.hash = route;
        }
    },

    /**
     * 検索画面のイベントを登録する。
     */
    bind() {

        const filters = document.getElementById(
            "global-search-filters"
        );

        const results = document.getElementById(
            "global-search-results"
        );

        // カテゴリの切り替え
        filters.onclick = event => {

            const button = event.target.closest(
                "[data-search-category]"
            );

            if (!button) return;

            this.category =
                button.dataset.searchCategory;

            this.displayLimit = 100;

            this.renderFilters();
            this.renderResults();
        };

        // 検索結果から詳細ページへ移動する。
        results.onclick = event => {

            const link = event.target.closest(
                "[data-search-route]"
            );

            if (link) {

                // Ctrlクリックなどの標準動作を維持する。
                if (
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey ||
                    event.altKey
                ) return;

                event.preventDefault();

                this.navigate(
                    link.dataset.searchRoute
                );

                return;
            }

            // 検索結果の追加表示
            if (event.target.closest("[data-search-more]")) {

                this.displayLimit += 100;
                this.renderResults();
            }
        };
    }
};
