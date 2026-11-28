/**
 * 外部アセットのデータ管理を担当する。
 *
 * アセット情報の読み込み、登録、更新、
 * 削除、依存関係の検出を行う。
 */
const DocsAssetManager = {

    // アセットJSONの格納先
    basePath: "data/assets/",

    // 登録済みアセット一覧
    assets: [],

    // 未保存の変更があるか
    isDirty: false,

    /**
     * アセット情報を読み込む。
     * @returns {Promise<Array<Object>>} アセット一覧
     */
    async load() {

        const manifest = await DocsData.loadJson(
            this.basePath + "manifest.json"
        );

        this.assets = await Promise.all(

            manifest.assets.map(path =>
                DocsData.loadJson(this.basePath + path)
            )
        );

        this.isDirty = false;

        DocsSearchIndex.invalidate();

        return this.assets;
    },

    /**
     * 全アセットを取得する。
     * @returns {Array<Object>} アセット一覧
     */
    getAll() {

        return this.assets;
    },

    /**
     * IDからアセットを取得する。
     * @param {string} id アセットID
     * @returns {Object|undefined} アセット情報
     */
    getById(id) {

        return this.assets.find(
            asset => asset.id === id
        );
    },

    /**
     * 新規アセットの初期データを生成する。
     * @returns {Object} アセット情報
     */
    create() {

        return {

            id: crypto.randomUUID(),

            name: "",
            version: "",
            publisher: "",
            category: "",
            summary: "",

            website: "",
            storeUrl: "",
            icon: "",

            detection: {
                namespaces: [],
                types: []
            },

            notes: ""
        };
    },

    /**
     * アセットを登録または更新する。
     * @param {Object} asset アセット情報
     */
    upsert(asset) {

        if (!asset?.id || !asset.name?.trim()) {

            throw new Error(
                "アセットIDと名前が必要です。"
            );
        }

        // ファイル名として安全なIDのみ許可する。
        if (!/^[a-zA-Z0-9_-]+$/.test(asset.id)) {

            throw new Error(
                "アセットIDの形式が不正です。"
            );
        }

        const index = this.assets.findIndex(
            item => item.id === asset.id
        );

        if (index >= 0) {

            this.assets[index] = asset;
        }
        else {

            this.assets.push(asset);
        }

        this.isDirty = true;

        DocsSearchIndex.invalidate();
    },

    /**
     * アセットを削除する。
     * @param {string} id アセットID
     * @returns {boolean} 削除結果
     */
    remove(id) {

        const index = this.assets.findIndex(
            asset => asset.id === id
        );

        if (index < 0) return false;

        this.assets.splice(index, 1);

        this.isDirty = true;

        DocsSearchIndex.invalidate();

        return true;
    },

    /**
     * 正規表現の特殊文字をエスケープする。
     * @param {string} value 対象文字列
     * @returns {string} 変換後の文字列
     */
    escapeRegex(value) {

        return value.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
    },

    /**
     * スクリプトとアセットの依存関係を検出する。
     * @param {Object} script スクリプト情報
     * @param {Object} asset アセット情報
     * @returns {Array<Object>} 検出結果
     */
    detect(script, asset) {

        const source = DocsParser.maskSource(
            script.source || ""
        );

        const imports = script.dependencies || [];

        const detection = asset.detection || {};

        const matches = [];

        // 名前空間による検出
        for (
            const namespace of
            detection.namespaces || []
        ) {

            if (!namespace.trim()) continue;

            const imported = imports.some(value =>

                value === namespace ||
                value.startsWith(namespace + ".")
            );

            const pattern = new RegExp(

                `\\b${this.escapeRegex(namespace)}\\.`
            );

            if (imported || pattern.test(source)) {

                matches.push({

                    kind: "namespace",

                    value: namespace
                });
            }
        }

        // 外部クラス名による検出
        for (
            const type of detection.types || []
        ) {

            if (!type.trim()) continue;

            const pattern = new RegExp(

                `\\b${this.escapeRegex(type)}\\b`
            );

            if (pattern.test(source)) {

                matches.push({

                    kind: "type",

                    value: type
                });
            }
        }

        return matches;
    },

    /**
     * スクリプトが利用するアセットを取得する。
     * @param {Object} script スクリプト情報
     * @returns {Array<Object>} アセットと検出結果
     */
    getAssetsForScript(script) {

        return this.assets.map(asset => ({

            asset,

            matches: this.detect(script, asset)

        })).filter(
            result => result.matches.length > 0
        );
    },

    /**
     * アセットを利用するスクリプトを取得する。
     * @param {string} assetId アセットID
     * @returns {Array<Object>} スクリプトと検出結果
     */
    getScriptsForAsset(assetId) {

        const asset = this.getById(assetId);

        if (!asset) return [];

        return DocsData.getAll().map(script => ({

            script,

            matches: this.detect(script, asset)

        })).filter(
            result => result.matches.length > 0
        );
    },

    /**
     * 外部アセットの統計情報を取得する。
     * @returns {Object} 統計情報
     */
    getStats() {

        const scripts = DocsData.getAll();

        return {

            assets: this.assets.length,

            usedAssets: this.assets.filter(asset =>

                this.getScriptsForAsset(asset.id)
                    .length > 0

            ).length,

            dependentScripts: scripts.filter(script =>

                this.getAssetsForScript(script)
                    .length > 0

            ).length
        };
    }
};