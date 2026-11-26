/**
 * 依存関係グラフの描画・操作を管理する。
 *
 * 依存関係の解析処理はDocsDependencyに委譲し、
 * 本クラスは視覚化のみを担当する。
 */
const DocsGraph = {

    // Cytoscapeインスタンス
    instance: null,

    // 現在選択されているスクリプトID
    selectedId: null,

    // 現在のレイアウト方式
    layoutName: "breadthfirst",

    /**
     * グラフを描画する。
     * @param {HTMLElement} container 描画先要素
     */
    render(container) {

        this.destroy();

        if (!container) return;

        // 外部ライブラリの読み込みを確認する。
        if (typeof cytoscape === "undefined") {

            container.textContent =
                "グラフ描画ライブラリを読み込めませんでした。";

            return;
        }

        const elements = this.createElements();

        if (!elements.length) {

            container.textContent =
                "登録済みスクリプトがありません。";

            return;
        }

        this.instance = cytoscape({

            container,

            elements,

            style: this.createStyles(),

            layout: this.createLayout(),

            minZoom: 0.1,
            maxZoom: 3,

            wheelSensitivity: 0.2,

            boxSelectionEnabled: false,

            userZoomingEnabled: true,
            userPanningEnabled: true
        });

        this.bindEvents();
    },

    /**
     * 登録済みスクリプトと依存関係から
     * グラフ要素を生成する。
     * @returns {Array<Object>} ノード・エッジ一覧
     */
    createElements() {

        const scripts = DocsData.getAll();

        const relations =
            DocsDependency.getAllRelations();

        // スクリプトをノードへ変換する。
        const nodes = scripts.map(script => ({

            group: "nodes",

            data: {

                id: script.id,

                label: script.name,

                namespace: script.namespace || "(Global)",

                kind: script.type || "class",

                memberCount: script.members?.length || 0
            }
        }));

        const ids = new Set(
            scripts.map(script => script.id)
        );

        // 依存関係をエッジへ変換する。
        const edges = relations
            .filter(relation =>
                ids.has(relation.from) &&
                ids.has(relation.to)
            )
            .map((relation, index) => ({

                group: "edges",

                data: {

                    id: `__dependency_edge_${index}`,

                    source: relation.from,

                    target: relation.to,

                    kind: relation.kinds.includes("inheritance")
                        ? "inheritance"
                        : "dependency",

                    label: DocsDependency
                        .getLabels(relation)
                        .join(" / ")
                }
            }));

        return [...nodes, ...edges];
    },

    /**
     * グラフの表示スタイルを生成する。
     */
    createStyles() {

        return [

            // 通常のクラスノード
            {
                selector: "node",

                style: {

                    "shape": "round-rectangle",

                    "width": 190,
                    "height": 54,

                    "background-color": "#ffffff",

                    "border-width": 1.5,
                    "border-color": "#94a3b8",

                    "label": "data(label)",

                    "font-size": 12,
                    "font-weight": 600,

                    "color": "#334155",

                    "text-valign": "center",
                    "text-halign": "center",

                    "text-wrap": "wrap",
                    "text-max-width": 175
                }
            },

            // インターフェース
            {
                selector: 'node[kind = "interface"]',

                style: {

                    "background-color": "#edf7ed",
                    "border-color": "#79a586"
                }
            },

            // 構造体
            {
                selector: 'node[kind = "struct"]',

                style: {

                    "background-color": "#fff5df",
                    "border-color": "#c5a35b"
                }
            },

            // 列挙型
            {
                selector: 'node[kind = "enum"]',

                style: {

                    "background-color": "#f3edff",
                    "border-color": "#a28acb"
                }
            },

            // 通常の依存関係
            {
                selector: "edge",

                style: {

                    "width": 1.5,

                    "line-color": "#94a3b8",

                    "target-arrow-color": "#94a3b8",
                    "target-arrow-shape": "triangle",

                    "curve-style": "bezier",

                    "arrow-scale": 1.1
                }
            },

            // 継承・インターフェース実装
            {
                selector: 'edge[kind = "inheritance"]',

                style: {

                    "line-style": "dashed",

                    "target-arrow-shape": "triangle",
                    "target-arrow-fill": "hollow",

                    "line-color": "#64748b",
                    "target-arrow-color": "#64748b"
                }
            },

            // 選択中のクラス
            {
                selector: "node.focused",

                style: {

                    "background-color": "#dbeafe",

                    "border-color": "#2563eb",
                    "border-width": 3
                }
            },

            // 選択クラスの依存先
            {
                selector: "node.dependency",

                style: {

                    "background-color": "#ecfdf5",
                    "border-color": "#16a34a",
                    "border-width": 2
                }
            },

            // 選択クラスの被依存元
            {
                selector: "node.dependent",

                style: {

                    "background-color": "#fff7ed",
                    "border-color": "#ea580c",
                    "border-width": 2
                }
            },

            // 強調表示する依存関係
            {
                selector: "edge.highlighted",

                style: {

                    "width": 2.5,

                    "line-color": "#2563eb",
                    "target-arrow-color": "#2563eb",

                    "label": "data(label)",

                    "font-size": 10,
                    "color": "#475569",

                    "text-background-color": "#ffffff",
                    "text-background-opacity": 1,
                    "text-background-padding": 3
                }
            },

            // 関係のない要素を薄く表示する。
            {
                selector: ".dimmed",

                style: {
                    "opacity": 0.12
                }
            }
        ];
    },

    /**
     * 自動配置の設定を生成する。
     */
    createLayout() {

        return {

            name: this.layoutName,

            directed: true,

            padding: 40,

            spacingFactor: 1.4,

            animate: false,

            fit: true
        };
    },

    /**
     * グラフの操作イベントを登録する。
     */
    bindEvents() {

        const cy = this.instance;

        // ノードをクリックすると関連クラスを強調する。
        cy.on("tap", "node", event => {

            this.focus(event.target.id());
        });

        // ノードをダブルクリックすると詳細ページへ移動する。
        cy.on("dbltap", "node", event => {

            const id = event.target.id();

            location.hash =
                `script/${encodeURIComponent(id)}`;
        });

        // 背景をクリックすると選択状態を解除する。
        cy.on("tap", event => {

            if (event.target === cy) {

                this.clearFocus();
            }
        });
    },

    /**
     * 指定スクリプトと直接の参照関係を強調する。
     * @param {string} id スクリプトID
     */
    focus(id) {

        if (!this.instance) return;

        const cy = this.instance;

        const node = cy.getElementById(id);

        if (!node.length) return;

        this.clearFocus();

        this.selectedId = id;

        // すべての要素を一旦薄く表示する。
        cy.elements().addClass("dimmed");

        // 依存先と被依存元を取得する。
        const outgoing = node.outgoers();

        const incoming = node.incomers();

        // 選択されたクラス
        node.removeClass("dimmed")
            .addClass("focused");

        // 依存先
        outgoing.nodes()
            .removeClass("dimmed")
            .addClass("dependency");

        // 被依存元
        incoming.nodes()
            .removeClass("dimmed")
            .addClass("dependent");

        // 関連する矢印
        outgoing.edges()
            .union(incoming.edges())
            .removeClass("dimmed")
            .addClass("highlighted");
    },

    /**
     * 選択・強調表示を解除する。
     */
    clearFocus() {

        this.selectedId = null;

        if (!this.instance) return;

        this.instance.elements().removeClass(
            "focused dependency dependent highlighted dimmed"
        );
    },

    /**
     * 自動配置方式を変更する。
     * @param {string} name レイアウト名
     */
    setLayout(name) {

        this.layoutName = name;

        if (!this.instance) return;

        this.instance
            .layout(this.createLayout())
            .run();
    },

    /**
     * グラフを拡大・縮小する。
     * @param {number} factor 現在の倍率に対する比率
     */
    zoom(factor) {

        if (!this.instance) return;

        const cy = this.instance;

        const level = Math.max(
            cy.minZoom(),
            Math.min(
                cy.maxZoom(),
                cy.zoom() * factor
            )
        );

        cy.zoom({

            level,

            renderedPosition: {

                x: cy.width() / 2,
                y: cy.height() / 2
            }
        });
    },

    /**
     * グラフ全体が画面に収まるよう調整する。
     */
    fit() {

        this.instance?.fit(undefined, 40);
    },

    /**
     * グラフを初期状態に戻す。
     */
    reset() {

        this.clearFocus();

        if (!this.instance) return;

        this.instance
            .layout(this.createLayout())
            .run();
    },

    /**
     * 描画インスタンスを破棄する。
     * ページ遷移時のメモリリークを防止する。
     */
    destroy() {

        if (this.instance) {

            this.instance.destroy();

            this.instance = null;
        }

        this.selectedId = null;
    }
};