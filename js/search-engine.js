
/**
 * グローバル検索エンジン
 *
 * 検索構文の解析、カテゴリ判定、
 * 関連性スコアの計算を行う。
 */
const DocsSearchEngine = {

    // APIとして扱うメンバーの種類
    apiKinds: [
        "constructor",
        "method",
        "property",
        "field",
        "constant",
        "event",
        "member"
    ],

    // 検索構文と検索対象の対応
    aliases: {
        script: ["script"],
        api: ["api"],
        method: ["method"],
        constructor: ["constructor"],
        property: ["property"],
        field: ["field"],
        constant: ["constant"],
        event: ["event"],
        tip: ["tip"],
        tips: ["tip"],
        example: ["example"],
        note: ["note"],
        related: ["related"],
        test: ["test"],
        asset: ["asset"]
    },

    /**
     * 検索構文を解析する。
     * @param {string} query 検索文字列
     * @returns {Object} 検索条件
     */
    parseQuery(query) {

        const conditions = {
            keywords: [],
            kinds: [],
            namespaces: []
        };

        // 引用符で囲まれたフレーズを維持する。
        const tokens = query.match(
            /(?:[^\s"]+|"[^"]*")+/g
        ) || [];

        for (let token of tokens) {

            // スクリプト検索
            if (token.startsWith("#")) {

                conditions.kinds.push("script");
                token = token.slice(1);
            }

            // API検索
            else if (token.startsWith("@")) {

                conditions.kinds.push("api");
                token = token.slice(1);
            }

            else {

                const colon = token.indexOf(":");

                if (colon >= 0) {

                    const prefix = token
                        .slice(0, colon)
                        .toLowerCase();

                    const value = token
                        .slice(colon + 1)
                        .replace(/^"|"$/g, "");

                    // 名前空間による絞り込み
                    if (prefix === "ns") {

                        if (value) {
                            conditions.namespaces.push(
                                value.toLowerCase()
                            );
                        }

                        continue;
                    }

                    // カテゴリ指定
                    if (Object.hasOwn(this.aliases, prefix)) {

                        conditions.kinds.push(
                            ...this.aliases[prefix]
                        );

                        token = value;
                    }
                }
            }

            token = token
                .replace(/^"|"$/g, "")
                .trim()
                .toLowerCase();

            if (token) {
                conditions.keywords.push(token);
            }
        }

        conditions.keywords = [
            ...new Set(conditions.keywords)
        ];

        return conditions;
    },

    /**
     * 指定カテゴリに一致するか判定する。
     * @param {string} kind データの種類
     * @param {string} category 検索カテゴリ
     * @returns {boolean} 一致結果
     */
    matchesCategory(kind, category) {

        if (category === "all") return true;

        if (category === "api") {
            return this.apiKinds.includes(kind);
        }

        return kind === category;
    },

    /**
     * 一致箇所ごとの関連性スコアを取得する。
     * @param {string} field 検索フィールド
     * @param {string} value 検索対象文字列
     * @param {string} keyword キーワード
     * @returns {number} スコア
     */
    getFieldScore(field, value, keyword) {

        if (!value.includes(keyword)) return 0;

        switch (field) {

            case "title":

                if (value === keyword) return 100;

                if (value.startsWith(keyword)) return 80;

                return 60;

            case "namespace":
                return 30;

            case "owner":
                return 25;

            case "summary":
                return 20;

            case "body":
                return 10;

            case "source":
                return 5;

            default:
                return 0;
        }
    },

    /**
     * 検索データの一致状況を評価する。
     * @param {Object} entry 検索データ
     * @param {Object} conditions 検索条件
     * @returns {Object|null} 評価結果
     */
    evaluate(entry, conditions) {

        // 検索構文によるカテゴリ指定
        if (
            conditions.kinds.length &&
            !conditions.kinds.some(kind =>
                this.matchesCategory(entry.kind, kind)
            )
        ) {
            return null;
        }

        // 名前空間による絞り込み
        if (!conditions.namespaces.every(namespace =>
            entry.searchFields.namespace.includes(namespace)
        )) {
            return null;
        }

        let score = 0;

        const matches = new Set();

        // 全キーワードが一致する必要がある。
        for (const keyword of conditions.keywords) {

            let bestScore = 0;

            for (const [field, value] of Object.entries(
                entry.searchFields
            )) {

                const fieldScore = this.getFieldScore(
                    field,
                    value,
                    keyword
                );

                if (fieldScore > 0) {

                    matches.add(field);

                    bestScore = Math.max(
                        bestScore,
                        fieldScore
                    );
                }
            }

            // 1つでも一致しないキーワードがあれば除外。
            if (!bestScore) return null;

            score += bestScore;
        }

        return {
            ...entry,
            score: score,
            matches: [...matches]
        };
    },

    /**
     * 検索を実行する。
     * @param {string} query 検索文字列
     * @returns {Object} 検索結果
     */
    search(query) {

        const conditions = this.parseQuery(query);

        const results = DocsSearchIndex.getAll()
            .map(entry => this.evaluate(entry, conditions))
            .filter(Boolean);

        // 関連性の高い結果を優先する。
        results.sort((a, b) =>

            b.score - a.score ||

            a.title.localeCompare(b.title) ||

            a.id.localeCompare(b.id)
        );

        return {
            query: query,
            conditions: conditions,
            results: results
        };
    },

    /**
     * 一致箇所周辺の文章を取得する。
     * @param {string} text 対象文章
     * @param {Array<string>} keywords キーワード一覧
     * @param {number} length 最大文字数の目安
     * @returns {string} 抜粋文章
     */
    createSnippet(text, keywords, length = 220) {

        const value = String(text || "")
            .replace(/\s+/g, " ")
            .trim();

        if (value.length <= length) return value;

        const lower = value.toLowerCase();

        const positions = keywords.map(
            keyword => lower.indexOf(keyword)
        ).filter(index => index >= 0);

        const position = positions.length
            ? Math.min(...positions)
            : 0;

        const start = Math.max(0, position - 45);

        const end = Math.min(
            value.length,
            start + length
        );

        return (
            (start > 0 ? "…" : "") +
            value.slice(start, end) +
            (end < value.length ? "…" : "")
        );
    }
};
