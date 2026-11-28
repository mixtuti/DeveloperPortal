/**
 * ドキュメントデータ管理
 */
const DocsData = {

    // JSONデータの格納先
    basePath: "data/",

    // 登録済みスクリプト情報
    scripts: [],

    // データの変更状態
    isDirty: false,

    /**
     * manifest.jsonを基準に全スクリプトを読み込む。
     */
    async load() {
        const manifest = await this.loadJson(
            this.basePath + "manifest.json"
        );

        this.scripts = await Promise.all(
            manifest.scripts.map(path =>
                this.loadJson(this.basePath + path)
            )
        );

        this.isDirty = false;

        // 全スクリプトの依存関係を構築する。
        DocsDependency.rebuild(this.scripts);

        // 検索インデックスを無効化する。
        DocsSearchIndex.invalidate();

        return this.scripts;
    },

    /**
     * 指定されたJSONファイルを読み込む。
     * @param {string} path ファイルパス
     * @returns {Promise<Object>} JSONデータ
     */
    async loadJson(path) {
        const response = await fetch(path, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`JSON読み込み失敗：${path}`);
        }

        return await response.json();
    },

    /**
     * 全スクリプトを取得する。
     */
    getAll() {
        return this.scripts;
    },

    /**
     * IDからスクリプトを取得する。
     * @param {string} id スクリプトID
     */
    getById(id) {
        return this.scripts.find(script => script.id === id);
    },

    /**
     * スクリプトを追加・更新する。
     * @param {Object} script スクリプト情報
     */
    upsert(script) {
        if (!script?.id) {
            throw new Error("スクリプトIDがありません。");
        }

        const index = this.scripts.findIndex(
            item => item.id === script.id
        );

        if (index >= 0) {
            this.scripts[index] = script;
        } else {
            this.scripts.push(script);
        }

        this.isDirty = true;

        // スクリプトの追加・更新を依存関係に反映する。
        DocsDependency.rebuild(this.scripts);

        // 次回検索時に最新データを使用する。
        DocsSearchIndex.invalidate();
    },

    /**
     * 指定されたスクリプトを削除する。
     * @param {string} id スクリプトID
     */
    remove(id) {
        const index = this.scripts.findIndex(
            script => script.id === id
        );

        if (index < 0) return false;

        this.scripts.splice(index, 1);
        this.isDirty = true;

        // スクリプトの削除を依存関係に反映する。
        DocsDependency.rebuild(this.scripts);

        // 削除したデータを検索対象から除外する。
        DocsSearchIndex.invalidate();

        return true;
    },

    /**
     * 登録されている名前空間の一覧を取得する。
     */
    getNamespaces() {
        return [...new Set(
            this.scripts.map(script =>
                script.namespace || "(Global)"
            )
        )].sort();
    },

    /**
     * スクリプト情報を全文検索する。
     * @param {string} keyword 検索キーワード
     */
    search(keyword) {
        const words = keyword.trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);

        return this.scripts.filter(script => {
            const text = JSON.stringify(script).toLowerCase();

            return words.every(word => text.includes(word));
        });
    },

    /**
     * 登録データの統計情報を取得する。
     */
    getStats() {
        return {
            scripts: this.scripts.length,
            namespaces: this.getNamespaces().length,

            members: this.scripts.reduce(
                (count, script) =>
                    count + (script.members?.length || 0),
                0
            ),

            tips: this.scripts.reduce(
                (count, script) =>
                    count + (script.tips?.length || 0),
                0
            )
        };
    }
};