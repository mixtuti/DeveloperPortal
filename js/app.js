/**
 * ドキュメントサイトの画面制御
 */
const DocsApp = {

    // 依存関係ページの表示モード
    dependencyView: "graph",

    // メインナビゲーションの定義
    menus: [
        { id: "home", label: "ホーム" },
        { id: "scripts", label: "スクリプト一覧" },
        { id: "dependencies", label: "依存関係" },
        { id: "tips", label: "Tips" },
        { id: "import", label: "解析・インポート" },
        { id: "editor", label: "補完・編集" },
        { id: "export", label: "JSON出力" }
    ],

    /**
     * サイトを初期化する。
     */
    async initialize() {
        this.renderNavigation();

        window.addEventListener("hashchange", () => {
            this.renderPage();
        });

        document.getElementById("search")
            .addEventListener("input", event => {
                const keyword = event.target.value.trim();

                if (keyword) {
                    this.renderSearch(keyword);
                } else {
                    this.renderPage();
                }
            });

        try {
            await DocsData.load();
        } catch (error) {
            this.notify(error.message);
        }

        this.refresh();
    },

    /**
     * サイト全体の表示を更新する。
     */
    refresh() {
        this.renderTree();
        this.renderStatus();
        this.renderPage();
    },

    /**
     * メインナビゲーションを生成する。
     */
    renderNavigation() {
        const nav = document.getElementById("nav");

        nav.innerHTML = this.menus.map(menu => `
            <a href="#${menu.id}" data-page="${menu.id}">
                ${menu.label}
            </a>
        `).join("");
    },

    /**
 * 名前空間ツリーを階層構造で生成する。
 */
    renderTree() {

        const tree = document.getElementById("tree");

        // ツリーのルートノード
        const root = {
            children: new Map(),
            scripts: []
        };

        // 名前空間を分割して階層構造を生成する。
        for (const script of DocsData.getAll()) {

            const parts = (script.namespace || "(Global)").split(".");

            let node = root;

            for (const part of parts) {

                if (!node.children.has(part)) {
                    node.children.set(part, {
                        children: new Map(),
                        scripts: []
                    });
                }

                node = node.children.get(part);
            }

            node.scripts.push(script);
        }

        tree.innerHTML = this.renderTreeNode(root);
    },

    /**
     * 名前空間ツリーのノードを再帰的に描画する。
     * @param {Object} node 描画対象ノード
     * @returns {string} 生成したHTML
     */
    renderTreeNode(node) {

        // 名前空間を名前順に並べる。
        const children = [...node.children.entries()]
            .sort(([a], [b]) => a.localeCompare(b));

        // 子名前空間を描画する。
        const folders = children.map(([name, child]) => `
        <details class="tree-node" open>

            <summary class="tree-folder">
                <span class="tree-folder-icon"></span>
                ${this.escape(name)}
            </summary>

            <div class="tree-group">
                ${this.renderTreeNode(child)}
            </div>

        </details>
    `).join("");

        // 所属するスクリプトを名前順に描画する。
        const scripts = [...node.scripts]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(script => `
            <div class="tree-script">
                ${this.scriptLink(script)}
            </div>
        `).join("");

        return folders + scripts;
    },

    /**
     * URLのハッシュに応じて画面を切り替える。
     */
    renderPage() {
        const route = location.hash.slice(1) || "home";

        document.getElementById("outline").replaceChildren();
        document.getElementById("related").replaceChildren();

        document.querySelectorAll("#nav a").forEach(link => {
            link.classList.toggle(
                "active",
                link.dataset.page === route
            );
        });

        if (route.startsWith("script/")) {
            const id = decodeURIComponent(route.slice(7));

            this.renderScript(id);
            return;
        }

        switch (route) {
            case "home":
                this.renderHome();
                break;

            case "scripts":
                this.renderScripts();
                break;

            case "import":
                this.renderImport();
                break;

            case "editor":
                this.renderEditor();
                break;

            case "export":
                this.renderExport();
                break;

            case "dependencies":
                this.renderDependencies();
                break;

            default:
                this.renderPlaceholder(route);
                break;
        }
    },

    /**
     * ホーム画面を表示する。
     */
    renderHome() {
        const stats = DocsData.getStats();

        this.setMain(`
            <h1>Unity Development Docs</h1>

            <p class="muted">
                Unityスクリプト管理・ドキュメントポータル
            </p>

            <div class="card-grid">
                ${this.statCard("Scripts", stats.scripts)}
                ${this.statCard("Namespaces", stats.namespaces)}
                ${this.statCard("Public APIs", stats.members)}
                ${this.statCard("Tips", stats.tips)}
            </div>

            <h2>登録済みスクリプト</h2>

            ${this.scriptList(DocsData.getAll())}
        `);
    },

    /**
 * C#スクリプトのインポート画面を表示する。
 */
    renderImport() {

        this.setMain(`
        <h1>解析・インポート</h1>

        <p>C#スクリプトからドキュメントを自動生成します。</p>

        <div class="drop-zone" id="drop-zone">

            <h3>C#スクリプトを読み込む</h3>

            <p class="muted">
                ファイルをドラッグ＆ドロップ
            </p>

            <button class="primary" id="select-files">
                ファイル選択
            </button>

            <button id="select-folder">
                フォルダ選択
            </button>

            <input type="file" id="file-input"
                accept=".cs" multiple hidden>

            <input type="file" id="folder-input"
                webkitdirectory multiple hidden>

        </div>

        <h2>解析結果</h2>

        <div id="import-results">
            <p class="muted">ファイルが選択されていません。</p>
        </div>
    `);

        const fileInput = document.getElementById("file-input");
        const folderInput = document.getElementById("folder-input");
        const dropZone = document.getElementById("drop-zone");

        document.getElementById("select-files").onclick =
            () => fileInput.click();

        document.getElementById("select-folder").onclick =
            () => folderInput.click();

        fileInput.onchange =
            () => this.importFiles(fileInput.files);

        folderInput.onchange =
            () => this.importFiles(folderInput.files);

        dropZone.ondragover = event => {
            event.preventDefault();
            dropZone.classList.add("dragover");
        };

        dropZone.ondragleave = () => {
            dropZone.classList.remove("dragover");
        };

        dropZone.ondrop = event => {
            event.preventDefault();
            dropZone.classList.remove("dragover");

            this.importFiles(event.dataTransfer.files);
        };
    },

    /**
     * 選択されたC#ファイルを解析して登録する。
     * @param {FileList} files 選択ファイル
     */
    async importFiles(files) {

        const results = [];

        for (const file of files) {

            if (!file.name.toLowerCase().endsWith(".cs")) {
                continue;
            }

            try {
                const script = await DocsParser.parseFile(file);

                // 既存の補完情報を引き継いで登録する。
                DocsData.upsert(DocsManager.merge(script));

                results.push(`
                <div class="card">
                    <span class="success">✓ 解析成功</span>
                    <h3>${this.scriptLink(script)}</h3>
                    <p>${script.members.length} 件の公開API</p>
                </div>
            `);

            } catch (error) {

                results.push(`
                <div class="card">
                    <span class="danger">✕ 解析失敗</span>
                    <p>${this.escape(file.name)}</p>
                    <p>${this.escape(error.message)}</p>
                </div>
            `);
            }
        }

        this.renderTree();
        this.renderStatus();

        const container = document.getElementById("import-results");

        if (container) {
            container.innerHTML = results.join("")
                || "<p>C#ファイルがありません。</p>";
        }

        this.notify("インポート処理が完了しました。");
    },

    /**
     * 補完情報の編集画面を表示する。
     * @param {string} id 編集対象のスクリプトID
     */
    renderEditor(id = "") {

        const scripts = DocsData.getAll();

        if (!scripts.length) {
            this.setMain(`
                <h1>補完・編集</h1>
                <p>先にC#スクリプトをインポートしてください。</p>
            `);
            return;
        }

        const script = DocsData.getById(id) || scripts[0];

        // 編集中の一時データ
        const draft = DocsManager.get(script.id);

        this.setMain(`
            <h1>補完・編集</h1>

            <div class="form-group">
                <label for="edit-target">対象スクリプト</label>

                <select id="edit-target">
                    ${scripts.map(item => `
                        <option
                            value="${this.escape(item.id)}"
                            ${item.id === script.id ? "selected" : ""}>
                            ${this.escape(item.id)}
                        </option>
                    `).join("")}
                </select>
            </div>

            <div id="editor-fields"></div>

            <div class="toolbar">
                <button class="primary" id="apply-editor">
                    変更を適用
                </button>

                <a class="button"
                    href="#script/${encodeURIComponent(script.id)}">
                    詳細を表示
                </a>
            </div>
        `);

        const container = document.getElementById("editor-fields");

        /**
         * 補完項目の一覧を再描画する。
         */
        const renderFields = () => {

            container.innerHTML = DocsManager.fields.map(field => `
                <section class="editor-section">

                    <div class="editor-heading">
                        <h2>${field.label}（${draft[field.key].length}）</h2>

                        <button data-add="${field.key}">
                            ＋ 追加
                        </button>
                    </div>

                    ${draft[field.key].map((item, index) => `
                        <div class="editor-item">

                            <div class="editor-item-header">
                                <strong>項目 ${index + 1}</strong>

                                <button class="danger"
                                    data-remove="${field.key}"
                                    data-index="${index}">
                                    削除
                                </button>
                            </div>

                            <input type="text"
                                placeholder="タイトル"
                                data-field="${field.key}"
                                data-index="${index}"
                                data-property="title"
                                value="${this.escape(item.title)}">

                            <textarea
                                placeholder="内容"
                                data-field="${field.key}"
                                data-index="${index}"
                                data-property="body">${this.escape(item.body)}</textarea>

                        </div>
                    `).join("")}

                </section>
            `).join("");
        };

        // 入力内容を一時データへ反映する。
        container.oninput = event => {

            const { field, index, property } = event.target.dataset;

            if (!field || !property) return;

            draft[field][Number(index)][property] =
                event.target.value;
        };

        // 項目の追加・削除を処理する。
        container.onclick = event => {

            const button = event.target.closest("button");

            if (!button) return;

            const { add, remove, index } = button.dataset;

            if (add) {
                draft[add].push(DocsManager.createItem());
            }

            if (remove) {
                draft[remove].splice(Number(index), 1);
            }

            renderFields();
        };

        // 編集対象を切り替える。
        document.getElementById("edit-target").onchange =
            event => this.renderEditor(event.target.value);

        // 編集内容を共通データへ反映する。
        document.getElementById("apply-editor").onclick = () => {

            DocsManager.save(script.id, draft);

            this.renderStatus();
            this.notify("補完情報を更新しました。");
        };

        renderFields();
    },

    /**
     * JSON出力画面を表示する。
     */
    renderExport() {

        const scripts = DocsData.getAll();

        this.setMain(`
            <h1>JSON出力</h1>

            <p>
                登録されたスクリプト情報と補完情報を
                JSONファイルとして保存します。
            </p>

            <div class="card">

                <h3>出力先フォルダ</h3>

                <p id="export-directory" class="muted">
                    ${this.escape(
            DocsExporter.rootHandle?.name ||
            "フォルダが選択されていません。"
        )}
                </p>

                <button id="select-directory">
                    フォルダ選択
                </button>

            </div>

            <h2>出力対象（${scripts.length + 1}件）</h2>

            <div class="card">

                ${scripts.map(script => `
                    <p>
                        <code>data/${this.escape(
            DocsExporter.getScriptPath(script)
        )}</code>
                    </p>
                `).join("")}

                <p><code>data/manifest.json</code></p>

            </div>

            <div class="toolbar">
                <button class="primary" id="export-all">
                    JSON一括保存
                </button>
            </div>

            <p id="export-result" role="status"></p>
        `);

        const selectButton =
            document.getElementById("select-directory");

        const exportButton =
            document.getElementById("export-all");

        const result =
            document.getElementById("export-result");

        // 出力先フォルダを選択する。
        selectButton.onclick = async () => {

            try {
                const directory =
                    await DocsExporter.selectDirectory();

                document.getElementById(
                    "export-directory"
                ).textContent = directory.name;

            } catch (error) {

                if (error.name !== "AbortError") {
                    this.notify(error.message);
                }
            }
        };

        // 全JSONファイルを保存する。
        exportButton.onclick = async () => {

            selectButton.disabled = true;
            exportButton.disabled = true;

            result.className = "muted";
            result.textContent = "保存中...";

            try {

                if (!DocsExporter.rootHandle) {
                    await DocsExporter.selectDirectory();
                }

                const count = await DocsExporter.exportAll();

                result.className = "success";
                result.textContent =
                    `${count}件のスクリプトを保存しました。`;

                this.renderStatus();
                this.notify("JSONの保存が完了しました。");

            } catch (error) {

                result.className = "danger";
                result.textContent = error.name === "AbortError"
                    ? "保存をキャンセルしました。"
                    : error.message;

            } finally {

                selectButton.disabled = false;
                exportButton.disabled = false;
            }
        };
    },

    /**
 * プロジェクト全体の依存関係を表示する。
 */
    renderDependencies() {

        const stats = DocsDependency.getStats();

        const scripts = [...DocsData.getAll()]
            .sort((a, b) => a.name.localeCompare(b.name));

        const isGraph = this.dependencyView === "graph";

        this.setMain(`

        <h1>依存関係</h1>

        <p>
            プロジェクト全体の参照関係を確認できます。
        </p>

        <div class="card-grid">

            ${this.statCard("スクリプト数", stats.scripts)}
            ${this.statCard("依存関係数", stats.relations)}
            ${this.statCard("参照されるクラス", stats.referenced)}
            ${this.statCard("孤立スクリプト", stats.isolated)}

        </div>

        <div class="view-tabs">

            <button id="dependency-graph-tab"
                class="${isGraph ? "active" : ""}">
                グラフ表示
            </button>

            <button id="dependency-table-tab"
                class="${!isGraph ? "active" : ""}">
                テーブル表示
            </button>

        </div>

        ${isGraph
                ? this.renderDependencyGraph(scripts)
                : this.renderDependencyTable(scripts)
            }
    `);

        // 表示モードを切り替える。
        document.getElementById(
            "dependency-graph-tab"
        ).onclick = () => {

            this.dependencyView = "graph";

            this.renderDependencies();
        };

        document.getElementById(
            "dependency-table-tab"
        ).onclick = () => {

            this.dependencyView = "table";

            this.renderDependencies();
        };

        // グラフ表示時のみ描画処理を実行する。
        if (isGraph) {

            this.initializeDependencyGraph();
        }
    },

    /**
 * 依存関係グラフの表示領域を生成する。
 * @param {Array<Object>} scripts スクリプト一覧
 */
    renderDependencyGraph(scripts) {

        return `

        <div class="graph-panel">

            <div class="graph-toolbar">

                <select id="graph-target">

                    <option value="">
                        すべてのスクリプト
                    </option>

                    ${scripts.map(script => `
                        <option value="${this.escape(script.id)}">
                            ${this.escape(script.id)}
                        </option>
                    `).join("")}

                </select>

                <select id="graph-layout">

                    <option value="breadthfirst">
                        階層配置
                    </option>

                    <option value="cose">
                        ネットワーク配置
                    </option>

                    <option value="circle">
                        円形配置
                    </option>

                    <option value="grid">
                        グリッド配置
                    </option>

                </select>

            </div>

            <div class="graph-canvas"
                 id="dependency-graph">
            </div>

            <div class="graph-controls">

                <button id="graph-zoom-in">＋</button>

                <button id="graph-zoom-out">－</button>

                <button id="graph-fit">
                    全体表示
                </button>

                <button id="graph-reset">
                    リセット
                </button>

            </div>

            <div class="graph-legend">

                <span>
                    <i class="legend-color legend-selected"></i>
                    選択中
                </span>

                <span>
                    <i class="legend-color legend-dependency"></i>
                    依存先
                </span>

                <span>
                    <i class="legend-color legend-dependent"></i>
                    被依存元
                </span>

                <span>→ 型・コード参照</span>

                <span>┄▷ 継承・実装</span>

            </div>

        </div>

        <p class="muted">
            ドラッグ：移動 /
            ホイール：拡大縮小 /
            クリック：関連表示 /
            ダブルクリック：詳細ページ
        </p>
    `;
    },

    /**
 * グラフを初期化し、操作イベントを登録する。
 */
    initializeDependencyGraph() {

        const container = document.getElementById(
            "dependency-graph"
        );

        DocsGraph.render(container);

        const target = document.getElementById(
            "graph-target"
        );

        const layout = document.getElementById(
            "graph-layout"
        );

        // 現在のレイアウト設定を反映する。
        layout.value = DocsGraph.layoutName;

        // 対象スクリプトを選択する。
        target.onchange = () => {

            if (target.value) {

                DocsGraph.focus(target.value);

            } else {

                DocsGraph.clearFocus();
            }
        };

        // 自動配置方式を変更する。
        layout.onchange = () => {

            DocsGraph.setLayout(layout.value);
        };

        // 拡大
        document.getElementById(
            "graph-zoom-in"
        ).onclick = () => {

            DocsGraph.zoom(1.2);
        };

        // 縮小
        document.getElementById(
            "graph-zoom-out"
        ).onclick = () => {

            DocsGraph.zoom(1 / 1.2);
        };

        // 全体表示
        document.getElementById(
            "graph-fit"
        ).onclick = () => {

            DocsGraph.fit();
        };

        // 初期状態に戻す。
        document.getElementById(
            "graph-reset"
        ).onclick = () => {

            target.value = "";

            DocsGraph.reset();
        };
    },

    /**
     * スクリプト別依存関係テーブルを生成する。
     * @param {Array<Object>} scripts スクリプト一覧
     */
    renderDependencyTable(scripts) {

        return `

        <h2>スクリプト別依存関係</h2>

        <div class="reference-table-wrap">

            <table class="reference-table">

                <thead>

                    <tr>
                        <th>スクリプト</th>
                        <th>依存先</th>
                        <th>被依存元</th>
                    </tr>

                </thead>

                <tbody>

                    ${scripts.map(script => {

            const dependencies =
                DocsDependency.getDependencies(
                    script.id
                );

            const dependents =
                DocsDependency.getDependents(
                    script.id
                );

            return `

                            <tr>

                                <td>

                                    ${this.scriptLink(script)}

                                    <div class="muted">
                                        ${this.escape(script.namespace)}
                                    </div>

                                </td>

                                <td>

                                    ${dependencies.map(item =>
                this.scriptLink(item.script)
            ).join("<br>") || "—"}

                                </td>

                                <td>

                                    ${dependents.map(item =>
                this.scriptLink(item.script)
            ).join("<br>") || "—"}

                                </td>

                            </tr>
                        `;

        }).join("")}

                </tbody>

            </table>

        </div>
    `;
    },

    /**
     * スクリプト一覧を表示する。
     */
    renderScripts() {
        this.setMain(`
            <h1>スクリプト一覧</h1>
            ${this.scriptList(DocsData.getAll())}
        `);
    },

    /**
 * 指定されたスクリプトの詳細画面を表示する。
 * @param {string} id スクリプトID
 */
    renderScript(id) {

        const script = DocsData.getById(id);

        if (!script) {

            this.setMain(`
            <h1>スクリプトが見つかりません。</h1>
        `);

            return;
        }

        // APIリファレンスを生成する。
        this.setMain(
            DocsReference.render(script)
        );

        const main = document.getElementById("main");
        const outline = document.getElementById("outline");

        // 詳細画面の目次を生成する。
        if (outline) {

            outline.innerHTML =
                DocsReference.renderOutline(main);

            DocsReference.bindNavigation(outline);
        }

        // API早見表のリンクを有効化する。
        DocsReference.bindNavigation(main);
    },

    /**
     * 全文検索結果を表示する。
     * @param {string} keyword 検索キーワード
     */
    renderSearch(keyword) {
        const results = DocsData.search(keyword);

        document.getElementById("outline").replaceChildren();
        document.getElementById("related").replaceChildren();

        this.setMain(`
            <h1>検索結果</h1>

            <p>
                「${this.escape(keyword)}」：${results.length}件
            </p>

            ${this.scriptList(results)}
        `);
    },

    /**
     * 未実装ページを表示する。
     */
    renderPlaceholder(id) {
        const menu = this.menus.find(item => item.id === id);

        this.setMain(`
            <h1>${this.escape(menu?.label || "ページがありません")}</h1>
            <p class="muted">現在準備中です。</p>
        `);
    },

    /**
     * スクリプト一覧のHTMLを生成する。
     */
    scriptList(scripts) {
        if (!scripts.length) {
            return "<p class='muted'>スクリプトがありません。</p>";
        }

        return scripts.map(script => `
            <div class="card">
                <h3>${this.scriptLink(script)}</h3>

                <p class="namespace">
                    ${this.escape(script.namespace)}
                </p>

                <p>${this.escape(script.summary)}</p>
            </div>
        `).join("");
    },

    /**
     * スクリプト詳細へのリンクを生成する。
     */
    scriptLink(script) {
        return `
            <a href="#script/${encodeURIComponent(script.id)}">
                ${this.escape(script.name)}
            </a>
        `;
    },

    /**
     * 統計情報カードを生成する。
     */
    statCard(label, value) {
        return `
            <div class="card">
                <div class="card-title">${this.escape(label)}</div>
                <div class="card-value">${value}</div>
            </div>
        `;
    },

    /**
     * 右サイドバーの管理状況を更新する。
     */
    renderStatus() {
        const stats = DocsData.getStats();

        document.getElementById("status").innerHTML = `
            <p>Scripts：${stats.scripts}</p>
            <p>Public APIs：${stats.members}</p>
            <p>Tips：${stats.tips}</p>

            <p class="${DocsData.isDirty ? "warning" : "muted"}">
                ${DocsData.isDirty ? "未保存の変更あり" : "未保存の変更なし"}
            </p>
        `;
    },

        /**
     * メインコンテンツを書き換える。
     * @param {string} html 表示するHTML
     */
    setMain(html) {

        // 前のページで使用していたグラフを破棄する。
        DocsGraph.destroy();

        document.getElementById("main").innerHTML = html;
    },

    /**
     * 通知メッセージを表示する。
     */
    notify(message) {
        const notification = document.getElementById("notification");

        notification.textContent = message;
        notification.hidden = false;

        clearTimeout(this.notificationTimer);

        this.notificationTimer = setTimeout(() => {
            notification.hidden = true;
        }, 3000);
    },

    /**
     * HTMLの特殊文字をエスケープする。
     * @param {*} value 変換対象
     * @returns {string} 変換後の文字列
     */
    escape(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }
};

// HTMLの読み込み完了後に初期化する。
document.addEventListener("DOMContentLoaded", () => {
    DocsApp.initialize();
});

