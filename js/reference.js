/**
 * スクリプトのAPIリファレンスを生成する。
 */
const DocsReference = {

    // 公開メンバーの分類定義
    groups: [
        { key: "constructor", label: "コンストラクタ" },
        { key: "constant", label: "定数" },
        { key: "field", label: "フィールド" },
        { key: "property", label: "プロパティ" },
        { key: "method", label: "メソッド" },
        { key: "event", label: "イベント" },
        { key: "member", label: "その他のメンバー" }
    ],

    /**
     * HTMLの特殊文字をエスケープする。
     * @param {*} value 変換対象
     * @returns {string} 変換結果
     */
    escape(value) {
        return String(value ?? "").replace(
            /[&<>"']/g,
            char => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[char]
        );
    },

    /**
     * 公開メンバーの種類を取得する。
     * @param {Object} member メンバー情報
     * @param {Object} script スクリプト情報
     */
    getMemberKind(member, script) {

        if (member.name === script.name) {
            return "constructor";
        }

        if (member.kind && member.kind !== "member") {
            return member.kind;
        }

        if (member.signature?.includes("(")) {
            return "method";
        }

        return "member";
    },

    /**
     * 公開メンバーを種類ごとに分類する。
     * @param {Object} script スクリプト情報
     */
    getGroups(script) {

        const members = (script.members || []).map(
            (member, index) => ({
                ...member,
                anchor: `api-${index}`,
                kind: this.getMemberKind(member, script)
            })
        );

        return this.groups.map(group => ({
            ...group,
            members: members.filter(
                member => member.kind === group.key
            )
        })).filter(group => group.members.length > 0);
    },

    /**
 * スクリプト詳細画面を生成する。
 * @param {Object} script スクリプト情報
 * @returns {string} 詳細画面のHTML
 */
    render(script) {

        const groups = this.getGroups(script);

        return `
        ${this.renderHeader(script)}
        ${this.renderOverview(script)}
        ${this.renderDependencies(script)}
        ${this.renderMemberSummary(groups)}
        ${groups.map(group =>
            this.renderMemberGroup(group)
        ).join("")}
        ${this.renderSupplements(script)}
        ${this.renderSource(script)}
        ${this.renderMetadata(script)}
    `;
    },

    /**
 * クラス名・型・修飾子を表示する。
 */
    renderHeader(script) {

        const badges = [
            script.accessibility,
            ...(script.modifiers || []),
            script.type
        ].filter(Boolean);

        return `
        <div class="reference-header">

            <div class="namespace">
                ${this.escape(script.namespace || "(Global)")}
            </div>

            <h1>${this.escape(script.name)}</h1>

            <div class="reference-badges">
                ${badges.map(value => `
                    <span class="badge">
                        ${this.escape(value)}
                    </span>
                `).join("")}
            </div>

            <p class="muted">
                ${this.escape(
            script.fileName || script.name + ".cs"
        )}
            </p>

            ${script.declaration ? `
                <pre class="signature"><code>${this.escape(
            script.declaration
        )}</code></pre>
            ` : ""}

        </div>
    `;
    },

    /**
     * メンバーの識別用表示名を生成する。
     * オーバーロードを引数の型によって区別する。
     */
    getMemberLabel(member) {

        if (!["method", "constructor"].includes(member.kind)) {
            return member.name;
        }

        // 旧形式のJSONでは従来の名前を使用する。
        if (!Array.isArray(member.parameters)) {
            return member.name;
        }

        const generics = member.typeParameters?.length
            ? `<${member.typeParameters.map(
                item => item.name
            ).join(", ")}>`
            : "";

        const parameters = member.parameters.map(item =>
            [item.modifier, item.type]
                .filter(Boolean)
                .join(" ") || item.name
        ).join(", ");

        return `${member.name}${generics}(${parameters})`;
    },

    /**
     * クラスの概要と継承情報を表示する。
     */
    renderOverview(script) {

        const inheritance = Array.isArray(script.inheritance)
            ? script.inheritance
            : [script.inheritance].filter(Boolean);

        return `
            <h2 id="ref-overview">概要</h2>

            <p class="document-body">${this.escape(
            script.summary || "概要が登録されていません。"
        )}</p>

            ${inheritance.length ? `
                <h3>継承・インターフェース</h3>

                <div class="reference-inheritance">
                    ${inheritance.map(value => `
                        <code>${this.escape(value)}</code>
                    `).join("")}

                    <span>↓</span>

                    <strong>${this.escape(script.name)}</strong>
                </div>
            ` : ""}
        `;
    },

    /**
     * スクリプトの依存関係と被依存関係を表示する。
     */
    renderDependencies(script) {

        const imports = script.dependencies || [];

        const dependencies =
            DocsDependency.getDependencies(script.id);

        const dependents =
            DocsDependency.getDependents(script.id);

        return `
            <h2 id="ref-dependencies">依存関係</h2>

            <div class="card-grid">

                <div class="card">
                    <div class="card-title">依存先</div>
                    <div class="card-value">
                        ${dependencies.length}
                    </div>
                </div>

                <div class="card">
                    <div class="card-title">被依存元</div>
                    <div class="card-value">
                        ${dependents.length}
                    </div>
                </div>

            </div>

            <h3>名前空間・宣言参照</h3>

            <div class="reference-dependencies">

                ${imports.map(value => `
                    <span class="reference-dependency">
                        ${this.escape(value)}
                    </span>
                `).join("") || "なし"}

            </div>

            <h3>依存先（Dependencies）</h3>

            ${this.renderRelationList(dependencies)}

            <h3>被依存元（Used By）</h3>

            ${this.renderRelationList(dependents)}
        `;
    },

    /**
 * 依存関係の一覧を生成する。
 * @param {Array<Object>} relations 関係性一覧
 */
    renderRelationList(relations) {

        if (!relations.length) {

            return `
            <p class="muted">
                登録済みスクリプトへの参照はありません。
            </p>
        `;
        }

        return `
        <div class="dependency-list">

            ${relations.map(relation => {

            const target = relation.script;

            if (!target) return "";

            return `
                    <a class="dependency-item"
                       href="#script/${encodeURIComponent(target.id)}">

                        <div class="dependency-icon">
                            ♯
                        </div>

                        <div class="dependency-content">

                            <strong>
                                ${this.escape(target.name)}
                            </strong>

                            <div class="muted">
                                ${this.escape(target.namespace)}
                            </div>

                            <div class="dependency-kinds">

                                ${DocsDependency.getLabels(
                relation
            ).map(label => `
                                    <span class="dependency-kind">
                                        ${this.escape(label)}
                                    </span>
                                `).join("")}

                            </div>

                        </div>

                        <span class="dependency-arrow">›</span>

                    </a>
                `;

        }).join("")}

        </div>
    `;
    },

    /**
     * API早見表を生成する。
     */
    renderMemberSummary(groups) {

        return `
            <h2 id="ref-members">公開API一覧</h2>

            <div class="card-grid">
                ${groups.map(group => `
                    <div class="card">
                        <div class="card-title">
                            ${group.label}
                        </div>
                        <div class="card-value">
                            ${group.members.length}
                        </div>
                    </div>
                `).join("")}
            </div>

            <div class="reference-table-wrap">
                <table class="reference-table">

                    <thead>
                        <tr>
                            <th>メンバー</th>
                            <th>種類</th>
                            <th>概要</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${groups.map(group =>
            group.members.map(member => `
                                <tr>
                                    <td>
                                        <button
                                            class="reference-link"
                                            data-scroll="${member.anchor}">
                                            ${this.escape(this.getMemberLabel(member))}
                                        </button>
                                    </td>
                                    <td>${group.label}</td>
                                    <td>
                                        ${this.escape(
                member.summary || "—"
            )}
                                    </td>
                                </tr>
                            `).join("")
        ).join("")}
                    </tbody>

                </table>
            </div>
        `;
    },

    /**
     * 分類ごとのAPI詳細を生成する。
     */
    renderMemberGroup(group) {

        return `
            <h2 id="ref-${group.key}">
                ${group.label}
            </h2>

            ${group.members.map(member =>
            this.renderMember(member)
        ).join("")}
        `;
    },

    /**
 * 個別APIの詳細情報を生成する。
 */
    renderMember(member) {

        const badges = [
            member.accessibility,
            ...(member.modifiers || [])
        ].filter(Boolean);

        return `
        <article class="reference-member"
            id="${member.anchor}">

            <h3>${this.escape(
            this.getMemberLabel(member)
        )}</h3>

            <div class="reference-badges">
                ${badges.map(value => `
                    <span class="badge">
                        ${this.escape(value)}
                    </span>
                `).join("")}
            </div>

            <pre class="signature"><code>${this.escape(
            member.signature
        )}</code></pre>

            <p class="document-body">${this.escape(
            member.summary || "概要未登録"
        )}</p>

            ${this.renderEntries(
            "型パラメータ",
            member.typeParameters,
            "名前"
        )}

            ${this.renderParameters(member.parameters)}

            ${member.returnType &&
                member.returnType !== "void" ? `

                <h4>戻り値</h4>

                <div class="reference-return">
                    <code>${this.escape(
                    member.returnType
                )}</code>

                    <p>${this.escape(
                    member.returns || "説明未登録"
                )}</p>
                </div>

            ` : this.renderText(
                    "戻り値",
                    member.returns
                )}

            ${member.valueType ? `
                <h4>型</h4>
                <code>${this.escape(member.valueType)}</code>
            ` : ""}

            ${member.value ? `
                <h4>値・初期値</h4>
                <pre><code>${this.escape(member.value)}</code></pre>
            ` : ""}

            ${member.accessors?.length ? `
                <h4>アクセサー</h4>

                <div class="reference-badges">
                    ${member.accessors.map(value => `
                        <span class="badge">
                            ${this.escape(value)}
                        </span>
                    `).join("")}
                </div>
            ` : ""}

            ${this.renderEntries(
                    "例外",
                    member.exceptions,
                    "例外型"
                )}

            ${this.renderText(
                    "備考",
                    member.remarks
                )}

        </article>
    `;
    },

    /**
     * インポートされたC#ソースコードを表示する。
     */
    renderSource(script) {

        if (!script.source) return "";

        return `
        <h2 id="ref-source">ソースコード</h2>

        <details class="reference-source">

            <summary>
                ${this.escape(script.fileName || script.name + ".cs")}
            </summary>

            <pre><code>${this.escape(
            script.source
        )}</code></pre>

        </details>
    `;
    },

    /**
     * XMLコメントの一覧データを共通形式に変換する。
     * 配列形式とオブジェクト形式の両方に対応する。
     */
    normalizeEntries(entries) {

        if (!entries) return [];

        if (Array.isArray(entries)) {

            return entries.map(item => {

                if (typeof item === "string") {
                    return {
                        name: "",
                        description: item
                    };
                }

                return {
                    name: item.name || item.cref || item.type || "",
                    description:
                        item.description ||
                        item.summary ||
                        item.text ||
                        item.value || ""
                };
            });
        }

        if (typeof entries === "object") {

            return Object.entries(entries).map(
                ([name, description]) => ({
                    name,
                    description
                })
            );
        }

        return [{
            name: "",
            description: entries
        }];
    },

    /**
     * 引数・例外などを表形式で表示する。
     */
    renderEntries(title, entries, nameLabel) {

        const rows = this.normalizeEntries(entries);

        if (!rows.length) return "";

        return `
            <h4>${title}</h4>

            <div class="reference-table-wrap">
                <table class="reference-table">

                    <thead>
                        <tr>
                            <th>${nameLabel}</th>
                            <th>説明</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                <td>
                                    <code>${this.escape(row.name)}</code>
                                </td>
                                <td>
                                    ${this.escape(row.description)}
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>

                </table>
            </div>
        `;
    },

    /**
 * 文章情報を表示する。
 */
    renderText(title, value) {

        if (!value) return "";

        return `
        <h4>${title}</h4>
        <p class="document-body">${this.escape(value)}</p>
    `;
    },

    /**
     * 手動で登録された補完情報を表示する。
     */
    renderSupplements(script) {

        return DocsManager.fields.map(field => {

            const items = DocsManager.normalize(
                script[field.key] || []
            );

            if (!items.length) return "";

            return `
                <h2 id="ref-${field.key}">
                    ${field.label}
                </h2>

                ${items.map(item => `
                    <div class="card reference-supplement">

                        <h3>
                            ${this.escape(
                item.title || field.label
            )}
                        </h3>

                        ${field.key === "examples"
                    ? `<pre><code>${this.escape(item.body)}</code></pre>`
                    : `<p class="document-body">${this.escape(item.body)}</p>`
                }

                    </div>
                `).join("")}
            `;

        }).join("");
    },

    /**
     * ドキュメントの管理情報を表示する。
     */
    renderMetadata(script) {

        const date = script.generatedAt
            ? new Date(script.generatedAt)
            : null;

        return `
            <h2 id="ref-metadata">管理情報</h2>

            <table class="reference-table">
                <tbody>
                    <tr>
                        <th>スクリプトID</th>
                        <td>${this.escape(script.id)}</td>
                    </tr>
                    <tr>
                        <th>公開API数</th>
                        <td>${script.members?.length || 0}</td>
                    </tr>
                    <tr>
                        <th>最終解析日時</th>
                        <td>${date && !isNaN(date.getTime())
                ? this.escape(date.toLocaleString("ja-JP"))
                : "不明"
            }</td>
                    </tr>
                </tbody>
            </table>
        `;
    },

    /**
 * 引数の型・初期値・説明を表示する。
 */
    renderParameters(parameters) {

        if (!parameters) return "";

        // 旧形式のJSONとの互換性を維持する。
        if (!Array.isArray(parameters)) {
            return this.renderEntries(
                "引数",
                parameters,
                "引数名"
            );
        }

        if (!parameters.length) return "";

        return `
        <h4>引数</h4>

        <div class="reference-table-wrap">
            <table class="reference-table">

                <thead>
                    <tr>
                        <th>名前</th>
                        <th>型</th>
                        <th>初期値</th>
                        <th>説明</th>
                    </tr>
                </thead>

                <tbody>
                    ${parameters.map(item => `
                        <tr>
                            <td>
                                <code>${this.escape(item.name)}</code>
                            </td>

                            <td>
                                <code>${this.escape(
            [item.modifier, item.type]
                .filter(Boolean)
                .join(" ") || "—"
        )}</code>
                            </td>

                            <td>
                                <code>${this.escape(
            item.defaultValue ?? "—"
        )}</code>
                            </td>

                            <td>
                                ${this.escape(item.description || "—")}
                            </td>
                        </tr>
                    `).join("")}
                </tbody>

            </table>
        </div>
    `;
    },

    /**
     * 詳細画面から右サイドバーの目次を生成する。
     * @param {HTMLElement} main 詳細画面
     */
    renderOutline(main) {

        const headings = main.querySelectorAll(
            "h2[id], article.reference-member[id]"
        );

        return `
            <div class="reference-outline">

                ${[...headings].map(element => {

            const isMember =
                element.tagName === "ARTICLE";

            const title = isMember
                ? element.querySelector("h3").textContent
                : element.textContent;

            return `
                        <button
                            class="outline-link ${isMember
                    ? "outline-child"
                    : ""}"
                            data-scroll="${this.escape(element.id)}">
                            ${this.escape(title.trim())}
                        </button>
                    `;

        }).join("")}

            </div>
        `;
    },

    /**
     * API早見表と目次のスクロール操作を設定する。
     * ハッシュによる画面遷移には影響させない。
     */
    bindNavigation(container) {

        container.querySelectorAll("[data-scroll]")
            .forEach(button => {

                button.onclick = () => {

                    const target = document.getElementById(
                        button.dataset.scroll
                    );

                    target?.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                };
            });
    }
};