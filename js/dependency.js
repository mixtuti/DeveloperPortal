/**
 * スクリプト間の依存関係を解析・管理する。
 *
 * 個別のC#解析結果を利用して、
 * プロジェクト全体の参照関係を構築する。
 */
const DocsDependency = {

    // スクリプトIDごとの依存先
    outgoing: new Map(),

    // スクリプトIDごとの被依存元
    incoming: new Map(),

    // 登録済みスクリプトの名前索引
    nameIndex: new Map(),

    // 登録済みスクリプトのID索引
    idIndex: new Map(),

    // 依存関係の表示名称
    labels: {
        inheritance: "継承・実装",
        parameter: "引数型",
        returnType: "戻り値型",
        memberType: "メンバー型",
        source: "ソースコード参照"
    },

    /**
     * 全スクリプトの依存関係を再構築する。
     * @param {Array<Object>} scripts 登録済みスクリプト
     */
    rebuild(scripts = DocsData.getAll()) {

        this.outgoing.clear();
        this.incoming.clear();
        this.nameIndex.clear();
        this.idIndex.clear();

        // スクリプトの検索用索引を構築する。
        for (const script of scripts) {

            this.idIndex.set(script.id, script);

            if (!this.nameIndex.has(script.name)) {
                this.nameIndex.set(script.name, []);
            }

            this.nameIndex.get(script.name).push(script);

            this.outgoing.set(script.id, []);
            this.incoming.set(script.id, []);
        }

        // 各スクリプトの依存先を解析する。
        for (const script of scripts) {

            this.analyze(script);
        }
    },

    /**
     * 指定されたスクリプトの依存関係を解析する。
     * @param {Object} script 対象スクリプト
     */
    analyze(script) {

        // 継承・インターフェース実装
        const inheritance = Array.isArray(script.inheritance)
            ? script.inheritance
            : [script.inheritance].filter(Boolean);

        for (const type of inheritance) {

            this.analyzeType(
                script,
                type,
                "inheritance"
            );
        }

        // 公開メンバーの型情報
        for (const member of script.members || []) {

            this.analyzeType(
                script,
                member.returnType,
                "returnType"
            );

            this.analyzeType(
                script,
                member.valueType,
                "memberType"
            );

            if (Array.isArray(member.parameters)) {

                for (const parameter of member.parameters) {

                    this.analyzeType(
                        script,
                        parameter.type,
                        "parameter"
                    );
                }
            }
        }

        // ソースコード内の参照を解析する。
        this.analyzeSource(script);
    },

    /**
     * 型宣言から参照されている型名を取得する。
     *
     * 例：
     * Dictionary<string, GridMap<T>>
     * → Dictionary, string, GridMap, T
     *
     * @param {string} value 型宣言
     * @returns {Array<string>} 型名一覧
     */
    extractTypeNames(value) {

        if (!value) return [];

        return [...new Set(
            value.match(
                /[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g
            ) || []
        )];
    },

    /**
     * 型情報から登録済みスクリプトを検索する。
     */
    analyzeType(script, value, kind) {

        const names = this.extractTypeNames(value);

        for (const name of names) {

            const target = this.resolve(script, name);

            if (!target) continue;

            this.addRelation(
                script.id,
                target.id,
                kind
            );
        }
    },

    /**
     * 型名から参照先のスクリプトを特定する。
     *
     * 完全修飾名、同一名前空間、
     * usingによる参照の順に検索する。
     *
     * @returns {Object|null} 参照先
     */
    resolve(script, name) {

        if (!name) return null;

        // 完全修飾名による検索
        if (name.includes(".") &&
            this.idIndex.has(name)) {

            return this.idIndex.get(name);
        }

        const candidates =
            this.nameIndex.get(name) || [];

        if (!candidates.length) return null;

        // 同一名前空間を優先する。
        const sameNamespace = candidates.filter(
            target =>
                target.namespace === script.namespace
        );

        if (sameNamespace.length === 1) {

            return sameNamespace[0];
        }

        // usingに含まれる名前空間を検索する。
        const imports = script.dependencies || [];

        const imported = candidates.filter(
            target =>
                imports.includes(target.namespace)
        );

        if (imported.length === 1) {

            return imported[0];
        }

        // 親名前空間を順番に検索する。
        const parts = (script.namespace || "")
            .split(".")
            .filter(Boolean);

        while (parts.length) {

            parts.pop();

            const parent = parts.join(".");

            const matches = candidates.filter(
                target =>
                    (target.namespace || "") === parent
            );

            if (matches.length === 1) {

                return matches[0];
            }
        }

        // 候補が一意でも名前空間を確認できない場合は
        // 誤ったリンクを生成しない。
        return null;
    },

    /**
     * ソースコード内の登録済み型への参照を解析する。
     *
     * コメント・文字列を除外したうえで、
     * 登録済みの型名と照合する。
     */
    analyzeSource(script) {

        if (!script.source) return;

        const source = DocsParser.maskSource(
            script.source
        );

        const tokens = new Set(
            source.match(
                /[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g
            ) || []
        );

        for (const token of tokens) {

            const parts = token.split(".");

            // GridMap.Create や完全修飾名にも対応する。
            while (parts.length) {

                const name = parts.join(".");

                const target = this.resolve(
                    script,
                    name
                );

                if (target) {

                    this.addRelation(
                        script.id,
                        target.id,
                        "source"
                    );

                    break;
                }

                parts.pop();
            }
        }
    },

    /**
     * 依存関係を登録する。
     *
     * 同一スクリプト間の関係は統合し、
     * 参照理由のみ追加する。
     */
    addRelation(from, to, kind) {

        // 自分自身への参照は除外する。
        if (from === to) return;

        const outgoing = this.outgoing.get(from);
        const incoming = this.incoming.get(to);

        if (!outgoing || !incoming) return;

        let relation = outgoing.find(
            item => item.to === to
        );

        if (!relation) {

            relation = {
                from,
                to,
                kinds: []
            };

            outgoing.push(relation);
            incoming.push(relation);
        }

        if (!relation.kinds.includes(kind)) {

            relation.kinds.push(kind);
        }
    },

    /**
     * 指定スクリプトの依存先を取得する。
     */
    getDependencies(id) {

        return (this.outgoing.get(id) || [])
            .map(relation => ({
                ...relation,
                script: this.idIndex.get(relation.to)
            }));
    },

    /**
     * 指定スクリプトの被依存元を取得する。
     */
    getDependents(id) {

        return (this.incoming.get(id) || [])
            .map(relation => ({
                ...relation,
                script: this.idIndex.get(relation.from)
            }));
    },

    /**
     * 関係性の表示名称を取得する。
     */
    getLabels(relation) {

        return relation.kinds.map(
            kind => this.labels[kind] || kind
        );
    },

    /**
     * プロジェクト全体の依存関係を取得する。
     */
    getAllRelations() {

        return [...this.outgoing.values()].flat();
    },

    /**
     * 依存関係の統計情報を取得する。
     */
    getStats() {

        const relations = this.getAllRelations();

        return {
            scripts: this.idIndex.size,
            relations: relations.length,

            referenced: [...this.incoming.values()]
                .filter(items => items.length > 0)
                .length,

            isolated: [...this.idIndex.keys()]
                .filter(id =>
                    !this.outgoing.get(id)?.length &&
                    !this.incoming.get(id)?.length
                ).length
        };
    }
};