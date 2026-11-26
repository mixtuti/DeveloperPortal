/**
 * ドキュメントの人力補完情報を管理する。
 */
const DocsManager = {

    // 補完情報の項目定義
    fields: [
        { key: "tips", label: "Tips" },
        { key: "examples", label: "使用例" },
        { key: "notes", label: "注意事項" },
        { key: "related", label: "関連スクリプト" },
        { key: "tests", label: "テスト情報" }
    ],

    /**
     * 新規補完項目を生成する。
     * @returns {Object} 補完項目
     */
    createItem() {
        return {
            id: crypto.randomUUID(),
            title: "",
            body: ""
        };
    },

    /**
     * 補完情報を共通形式に変換する。
     * 旧形式の文字列データにも対応する。
     * @param {Array} items 補完情報
     */
    normalize(items = []) {
        return items.map(item => {

            if (typeof item === "string") {
                return {
                    ...this.createItem(),
                    body: item
                };
            }

            return {
                id: item.id || crypto.randomUUID(),
                title: item.title || "",
                body: item.body || ""
            };
        });
    },

    /**
     * 指定されたスクリプトの補完情報を取得する。
     * @param {string} id スクリプトID
     */
    get(id) {
        const script = DocsData.getById(id);

        if (!script) {
            throw new Error("スクリプトが見つかりません。");
        }

        const result = {};

        for (const field of this.fields) {
            result[field.key] = this.normalize(
                script[field.key] || []
            );
        }

        return result;
    },

    /**
     * 補完情報を更新する。
     * @param {string} id スクリプトID
     * @param {Object} values 補完情報
     */
    save(id, values) {
        const script = DocsData.getById(id);

        if (!script) {
            throw new Error("スクリプトが見つかりません。");
        }

        const updated = { ...script };

        for (const field of this.fields) {
            updated[field.key] = this.normalize(
                values[field.key] || []
            );
        }

        DocsData.upsert(updated);
    },

    /**
     * 再解析時に既存の補完情報を引き継ぐ。
     * @param {Object} script 新しい解析結果
     */
    merge(script) {
        const previous = DocsData.getById(script.id);

        for (const field of this.fields) {
            script[field.key] = this.normalize(
                previous?.[field.key] || []
            );
        }

        return script;
    }
};