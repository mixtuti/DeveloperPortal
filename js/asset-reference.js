/**
 * 外部アセット管理の表示処理を担当する。
 */
const DocsAssetReference = {

    /**
     * HTML特殊文字をエスケープする。
     */
    escape(value) {

        return DocsReference.escape(value);
    },

    /**
     * 外部リンクとして安全なURLを取得する。
     */
    safeUrl(value) {

        try {

            const url = new URL(value);

            if (
                url.protocol === "https:" ||
                url.protocol === "http:"
            ) {

                return url.href;
            }
        }
        catch {
            // 無効なURLは表示しない。
        }

        return "";
    },

    /**
     * アセット詳細ページへのリンクを生成する。
     */
    assetLink(asset) {

        return `
            <a href="#asset/${encodeURIComponent(asset.id)}">
                ${this.escape(asset.name)}
            </a>
        `;
    },

    /**
     * アセットのアイコンを生成する。
     */
    renderIcon(asset) {

        const url = this.safeUrl(asset.icon);

        if (url) {

            return `
                <img
                    class="asset-icon"
                    src="${this.escape(url)}"
                    alt=""
                    loading="lazy"
                >
            `;
        }

        return `
            <div class="asset-icon asset-icon-placeholder">
                📦
            </div>
        `;
    },

    /**
     * アセット一覧ページを生成する。
     */
    renderList() {

        const stats = DocsAssetManager.getStats();

        const assets = [...DocsAssetManager.getAll()]
            .sort((a, b) =>
                a.name.localeCompare(b.name)
            );

        return `

            <h1>External Assets</h1>

            <p class="muted">
                プロジェクトで利用する外部アセットを管理します。
            </p>

            <div class="toolbar">

                <a
                    class="button primary"
                    href="#asset-editor"
                >
                    ＋ アセット登録
                </a>

            </div>

            <div class="card-grid">

                ${DocsApp.statCard(
                    "登録アセット",
                    stats.assets
                )}

                ${DocsApp.statCard(
                    "利用中のアセット",
                    stats.usedAssets
                )}

                ${DocsApp.statCard(
                    "依存スクリプト",
                    stats.dependentScripts
                )}

            </div>

            <h2>登録済みアセット</h2>

            ${assets.map(asset =>
                this.renderCard(asset)
            ).join("")}

            ${!assets.length ? `
                <p class="muted">
                    アセットが登録されていません。
                </p>
            ` : ""}
        `;
    },

    /**
     * アセット一覧用カードを生成する。
     */
    renderCard(asset) {

        const scripts =
            DocsAssetManager.getScriptsForAsset(asset.id);

        return `

            <div class="card asset-card">

                ${this.renderIcon(asset)}

                <div class="asset-card-content">

                    <h3>${this.assetLink(asset)}</h3>

                    <div class="muted">
                        ${this.escape(asset.publisher)}
                    </div>

                    <p>
                        ${this.escape(asset.summary)}
                    </p>

                    <div class="asset-card-meta">

                        <span class="badge">
                            ${this.escape(
                                asset.category || "未分類"
                            )}
                        </span>

                        <span class="badge">
                            Version:
                            ${this.escape(
                                asset.version || "未登録"
                            )}
                        </span>

                        <span class="badge">
                            依存スクリプト：${scripts.length}
                        </span>

                    </div>

                </div>

            </div>
        `;
    },

    /**
     * アセット詳細ページを生成する。
     */
    renderDetail(asset) {

        const scripts =
            DocsAssetManager.getScriptsForAsset(asset.id);

        const detection = asset.detection || {};

        return `

            <div class="asset-card">

                ${this.renderIcon(asset)}

                <div>

                    <h1>${this.escape(asset.name)}</h1>

                    <p class="muted">
                        ${this.escape(asset.publisher)}
                    </p>

                </div>

            </div>

            <div class="toolbar">

                <a
                    class="button"
                    href="#assets"
                >
                    一覧へ戻る
                </a>

                <a
                    class="button primary"
                    href="#asset-editor/${encodeURIComponent(asset.id)}"
                >
                    編集
                </a>

            </div>

            <h2>基本情報</h2>

            <p class="document-body">
                ${this.escape(asset.summary)}
            </p>

            <table class="reference-table">

                <tbody>

                    <tr>
                        <th>バージョン</th>
                        <td>
                            ${this.escape(
                                asset.version || "未登録"
                            )}
                        </td>
                    </tr>

                    <tr>
                        <th>カテゴリ</th>
                        <td>
                            ${this.escape(asset.category)}
                        </td>
                    </tr>

                    <tr>
                        <th>公式サイト</th>
                        <td>
                            ${this.renderExternalLink(
                                asset.website
                            )}
                        </td>
                    </tr>

                    <tr>
                        <th>Asset Store</th>
                        <td>
                            ${this.renderExternalLink(
                                asset.storeUrl
                            )}
                        </td>
                    </tr>

                </tbody>

            </table>

            <h2>依存関係の検出ルール</h2>

            <h3>名前空間</h3>

            ${this.renderRules(detection.namespaces)}

            <h3>クラス・型名</h3>

            ${this.renderRules(detection.types)}

            <h2>依存スクリプト（${scripts.length}）</h2>

            ${scripts.map(result => `

                <div class="card">

                    <h3>
                        ${DocsApp.scriptLink(result.script)}
                    </h3>

                    <p class="namespace">
                        ${this.escape(result.script.namespace)}
                    </p>

                    <div class="asset-card-meta">

                        ${result.matches.map(match => `

                            <span class="badge">
                                ${this.escape(match.value)}
                            </span>

                        `).join("")}

                    </div>

                </div>

            `).join("")}

            ${!scripts.length ? `
                <p class="muted">
                    依存スクリプトは検出されていません。
                </p>
            ` : ""}

            <h2>導入時の注意事項</h2>

            <p class="document-body">
                ${this.escape(asset.notes || "未登録")}
            </p>
        `;
    },

    /**
     * 外部リンクを生成する。
     */
    renderExternalLink(value) {

        const url = this.safeUrl(value);

        if (!url) return "未登録";

        return `

            <a
                href="${this.escape(url)}"
                target="_blank"
                rel="noopener noreferrer"
            >
                ${this.escape(url)}
            </a>
        `;
    },

    /**
     * 検出ルールを表示する。
     */
    renderRules(values = []) {

        if (!values.length) {

            return `<p class="muted">未登録</p>`;
        }

        return `

            <div class="asset-card-meta">

                ${values.map(value => `

                    <code class="badge">
                        ${this.escape(value)}
                    </code>

                `).join("")}

            </div>
        `;
    },

    /**
     * スクリプト詳細ページ用のアセット情報を生成する。
     */
    renderScriptAssets(script) {

        const results =
            DocsAssetManager.getAssetsForScript(script);

        if (!results.length) return "";

        return `

            <h2 id="ref-external-assets">
                外部アセット
            </h2>

            ${results.map(result => `

                <div class="card asset-card">

                    ${this.renderIcon(result.asset)}

                    <div class="asset-card-content">

                        <h3>
                            ${this.assetLink(result.asset)}
                        </h3>

                        <p class="muted">
                            Version:
                            ${this.escape(
                                result.asset.version || "未登録"
                            )}
                        </p>

                        <div class="asset-card-meta">

                            ${result.matches.map(match => `

                                <span class="badge">
                                    ${this.escape(match.value)}
                                </span>

                            `).join("")}

                        </div>

                    </div>

                </div>

            `).join("")}
        `;
    },

    /**
     * アセット編集用の入力欄を生成する。
     */
    renderInput(label, name, value, multiline = false) {

        return `

            <div class="form-group">

                <label for="asset-${name}">
                    ${this.escape(label)}
                </label>

                ${multiline ? `

                    <textarea
                        id="asset-${name}"
                        name="${name}"
                        rows="4"
                    >${this.escape(value)}</textarea>

                ` : `

                    <input
                        id="asset-${name}"
                        name="${name}"
                        type="text"
                        value="${this.escape(value)}"
                    >

                `}

            </div>
        `;
    },

    /**
     * アセット編集画面を生成する。
     */
    renderEditor(asset, isNew) {

        return `

            <h1>
                ${isNew ? "アセット登録" : "アセット編集"}
            </h1>

            <form id="asset-editor-form">

                <div class="card">

                    <h2>基本情報</h2>

                    ${this.renderInput(
                        "アセット名", "name", asset.name
                    )}

                    ${this.renderInput(
                        "バージョン", "version", asset.version
                    )}

                    ${this.renderInput(
                        "開発元", "publisher", asset.publisher
                    )}

                    ${this.renderInput(
                        "カテゴリ", "category", asset.category
                    )}

                    ${this.renderInput(
                        "概要", "summary", asset.summary, true
                    )}

                    ${this.renderInput(
                        "公式サイト", "website", asset.website
                    )}

                    ${this.renderInput(
                        "Asset Store URL", "storeUrl", asset.storeUrl
                    )}

                    ${this.renderInput(
                        "アイコンURL", "icon", asset.icon
                    )}

                </div>

                <div class="card">

                    <h2>依存関係の検出ルール</h2>

                    <p class="muted">
                        検出対象を1行につき1件入力してください。
                    </p>

                    ${this.renderInput(

                        "名前空間",

                        "namespaces",

                        (asset.detection?.namespaces || [])
                            .join("\n"),

                        true
                    )}

                    ${this.renderInput(

                        "クラス・型名",

                        "types",

                        (asset.detection?.types || [])
                            .join("\n"),

                        true
                    )}

                </div>

                <div class="card">

                    <h2>補足情報</h2>

                    ${this.renderInput(
                        "注意事項", "notes", asset.notes, true
                    )}

                </div>

                <div class="toolbar">

                    <button
                        type="submit"
                        class="button primary"
                    >
                        変更を適用
                    </button>

                    <a class="button" href="#assets">
                        キャンセル
                    </a>

                    ${!isNew ? `

                        <button
                            type="button"
                            id="delete-asset"
                            class="button"
                        >
                            削除
                        </button>

                    ` : ""}

                </div>

            </form>
        `;
    },

    /**
     * 編集画面の操作イベントを登録する。
     */
    bindEditor(asset) {

        const form = document.getElementById(
            "asset-editor-form"
        );

        if (!form) return;

        form.onsubmit = event => {

            event.preventDefault();

            const data = new FormData(form);

            // 入力値を取得する。
            const get = name =>
                String(data.get(name) || "").trim();

            // 複数行の検出ルールを配列に変換する。
            const getRules = name => [

                ...new Set(

                    get(name)
                        .split(/\r?\n/)
                        .map(value => value.trim())
                        .filter(Boolean)
                )
            ];

            const updated = {

                ...asset,

                name: get("name"),
                version: get("version"),
                publisher: get("publisher"),
                category: get("category"),
                summary: get("summary"),

                website: get("website"),
                storeUrl: get("storeUrl"),
                icon: get("icon"),

                detection: {

                    namespaces: getRules("namespaces"),

                    types: getRules("types")
                },

                notes: get("notes")
            };

            try {

                DocsAssetManager.upsert(updated);

                DocsApp.renderStatus();

                DocsApp.notify(
                    "アセット情報を更新しました。"
                );

                location.hash =
                    "#asset/" +
                    encodeURIComponent(updated.id);
            }
            catch (error) {

                DocsApp.notify(error.message);
            }
        };

        const deleteButton = document.getElementById(
            "delete-asset"
        );

        if (deleteButton) {

            deleteButton.onclick = () => {

                if (!confirm(
                    `${asset.name}を削除しますか？`
                )) {

                    return;
                }

                DocsAssetManager.remove(asset.id);

                DocsApp.renderStatus();

                DocsApp.notify(
                    "アセットを削除しました。"
                );

                location.hash = "#assets";
            };
        }
    }
};