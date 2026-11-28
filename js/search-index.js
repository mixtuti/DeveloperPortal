
/**
 * 検索インデックス管理
 *
 * 登録済みの解析情報や補完情報を
 * 共通の検索データ形式に変換する。
 */
const DocsSearchIndex = {

    // 構築済みの検索データ
    entries: [],

    // インデックスの再構築が必要か
    isDirty: true,

    // 検索対象の種類と表示情報
    kinds: {
        script:      { label: "Script", symbol: "#" },
        constructor: { label: "Constructor", symbol: "C" },
        method:      { label: "Method", symbol: "ƒ" },
        property:    { label: "Property", symbol: "P" },
        field:       { label: "Field", symbol: "F" },
        constant:    { label: "Constant", symbol: "C" },
        event:       { label: "Event", symbol: "E" },
        member:      { label: "Member", symbol: "@" },
        tip:         { label: "Tips", symbol: "💡" },
        example:     { label: "Example", symbol: "</>" },
        note:        { label: "Note", symbol: "!" },
        related:     { label: "Related", symbol: "↗" },
        test:        { label: "Test", symbol: "✓" },
        asset:       { label: "Asset", symbol: "◇" }
    },

    // 補完情報の検索対象
    supplementKinds: {
        tips: "tip",
        examples: "example",
        notes: "note",
        related: "related",
        tests: "test"
    },

    /**
     * 検索インデックスを無効化する。
     *
     * データ変更時に呼び出し、
     * 次回検索時に再構築する。
     */
    invalidate() {
        this.isDirty = true;
    },

    /**
     * 検索用の文字列に変換する。
     * @param {*} value 変換対象
     * @returns {string} 検索用文字列
     */
    toText(value) {

        if (value == null) return "";

        if (Array.isArray(value)) {
            return value.map(
                item => this.toText(item)
            ).join("\n");
        }

        if (typeof value === "object") {
            return Object.values(value).map(
                item => this.toText(item)
            ).join("\n");
        }

        return String(value);
    },

    /**
     * 検索データを取得する。
     * @returns {Array<Object>} 検索データ一覧
     */
    getAll() {

        if (this.isDirty) {
            this.rebuild();
        }

        return this.entries;
    },

    /**
     * 検索インデックスを再構築する。
     */
    rebuild() {

        const entries = [];

        // スクリプトと補完情報を登録する。
        for (const script of DocsData.getAll()) {

            entries.push(
                this.createScriptEntry(script)
            );

            entries.push(
                ...this.createMemberEntries(script)
            );

            entries.push(
                ...this.createSupplementEntries(script)
            );
        }

        // 外部アセットを登録する。
        if (typeof DocsAssetManager !== "undefined") {

            for (const asset of DocsAssetManager.getAll()) {

                entries.push(
                    this.createAssetEntry(asset)
                );
            }
        }

        // 検索時の小文字変換を省略するため、
        // 検索用文字列を事前に生成する。
        this.entries = entries.map(entry => {

            const fields = {};

            for (const key of [
                "title",
                "namespace",
                "owner",
                "summary",
                "body",
                "source"
            ]) {

                fields[key] = this.toText(entry[key]);

            }

            return {
                ...entry,
                ...fields,

                searchFields: Object.fromEntries(
                    Object.entries(fields).map(
                        ([key, value]) => [
                            key,
                            value.toLowerCase()
                        ]
                    )
                )
            };
        });

        this.isDirty = false;
    },

    /**
     * スクリプトの検索データを生成する。
     * @param {Object} script スクリプト情報
     * @returns {Object} 検索データ
     */
    createScriptEntry(script) {

        return {
            id: `script:${script.id}`,
            kind: "script",

            title: script.name,
            namespace: script.namespace,
            owner: "",

            summary: script.summary,

            body: this.toText([
                script.declaration,
                script.remarks,
                script.inheritance,
                script.dependencies
            ]),

            source: script.source || "",

            route:
                `script/${encodeURIComponent(script.id)}`
        };
    },

    /**
     * メンバーの検索データを生成する。
     * @param {Object} script スクリプト情報
     * @returns {Array<Object>} 検索データ一覧
     */
    createMemberEntries(script) {

        return (script.members || []).map(
            (member, index) => {

                const kind = this.kinds[member.kind]
                    ? member.kind
                    : "member";

                return {
                    id: `member:${script.id}:${index}`,
                    kind: kind,

                    title: member.name,
                    namespace: script.namespace,
                    owner: script.name,

                    summary: member.summary,

                    body: this.toText([
                        member.signature,
                        member.parameters,
                        member.typeParameters,
                        member.returnType,
                        member.valueType,
                        member.value,
                        member.returns,
                        member.remarks,
                        member.exceptions
                    ]),

                    source: "",

                    route:
                        `script/${encodeURIComponent(script.id)}`
                };
            }
        );
    },

    /**
     * Tipsや使用例などの検索データを生成する。
     * @param {Object} script スクリプト情報
     * @returns {Array<Object>} 検索データ一覧
     */
    createSupplementEntries(script) {

        const entries = [];

        for (const [key, kind] of Object.entries(
            this.supplementKinds
        )) {

            const items = script[key] || [];

            items.forEach((item, index) => {

                // 旧形式の文字列データにも対応する。
                const data = typeof item === "string"
                    ? { title: "", body: item }
                    : item;

                if (!data) return;

                entries.push({

                    id: `${kind}:${script.id}:${index}`,
                    kind: kind,

                    title:
                        data.title ||
                        `${this.kinds[kind].label} ${index + 1}`,

                    namespace: script.namespace,
                    owner: script.name,

                    summary: "",
                    body: this.toText(data.body),
                    source: "",

                    route:
                        `script/${encodeURIComponent(script.id)}`
                });
            });
        }

        return entries;
    },

    /**
     * 外部アセットの検索データを生成する。
     * @param {Object} asset アセット情報
     * @returns {Object} 検索データ
     */
    createAssetEntry(asset) {

        return {
            id: `asset:${asset.id}`,
            kind: "asset",

            title: asset.name,
            namespace: "",
            owner: asset.publisher,

            summary: asset.summary,

            body: this.toText([
                asset.version,
                asset.category,
                asset.notes,
                asset.detection
            ]),

            source: "",

            route:
                `asset/${encodeURIComponent(asset.id)}`
        };
    }
};
