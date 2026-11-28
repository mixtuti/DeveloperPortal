/**
 * C#の型構造を解析する。
 *
 * 既存のDocsParserを利用しながら、
 * 複数の型、内部クラス、非公開メンバー、
 * 属性、フィールドの初期値を取得する。
 */
const DocsTypeParser = {

    /**
     * ソースコード内の型構造を解析する。
     * @param {string} source C#ソースコード
     * @returns {Array<Object>} 型情報一覧
     */
    parse(source) {

        const masked = DocsParser.maskSource(source);

        const pattern =
            /((?:(?:public|private|protected|internal|static|abstract|sealed|partial|readonly|unsafe|new|ref)\s+)*)\b(class|interface|struct|enum|record(?:\s+struct|\s+class)?)\s+(\w+)\s*(<[^{};]*?>)?([^{};]*)\{/g;

        const declarations = [];

        // ソースコード内の型宣言をすべて取得する。
        for (const match of masked.matchAll(pattern)) {

            const bodyStart =
                match.index + match[0].length - 1;

            const bodyEnd = DocsParser.findClosing(
                masked,
                bodyStart,
                "{",
                "}"
            );

            if (bodyEnd < 0) continue;

            declarations.push({
                match,
                start: match.index,
                bodyStart,
                bodyEnd,
                children: []
            });
        }

        const roots = [];

        // 宣言位置から親子関係を構築する。
        for (const declaration of declarations) {

            const parents = declarations.filter(parent =>
                parent !== declaration &&
                parent.bodyStart < declaration.start &&
                parent.bodyEnd > declaration.bodyEnd
            );

            // 最も近い型を親として扱う。
            parents.sort((a, b) =>
                b.bodyStart - a.bodyStart
            );

            const parent = parents[0];

            if (parent) {
                parent.children.push(declaration);
            }
            else {
                roots.push(declaration);
            }
        }

        return roots.map(declaration =>
            this.createType(
                source,
                masked,
                declaration,
                null
            )
        );
    },

    /**
     * 型宣言から型情報を生成する。
     * @param {string} source 元のソースコード
     * @param {string} masked マスク済みソースコード
     * @param {Object} declaration 型宣言情報
     * @param {Object|null} parent 親の型情報
     * @returns {Object} 型情報
     */
    createType(source, masked, declaration, parent) {

        const match = declaration.match;

        const modifiers =
            DocsParser.parseModifiers(match[1]);

        const prefix = this.getDeclarationPrefix(
            source,
            declaration.start
        );

        const xml = DocsParser.parseXml(
            DocsParser.getXmlBefore(
                source,
                declaration.start
            )
        );

        const inheritanceText =
            match[5].split(/\bwhere\b/)[0].trim();

        const type = {

            name: match[3],

            fullName: parent
                ? `${parent.fullName}.${match[3]}`
                : match[3],

            kind: match[2],

            accessibility:
                modifiers.accessibility ||
                (parent ? "private" : "internal"),

            modifiers: modifiers.modifiers,

            summary: xml.summary,

            remarks: xml.remarks,

            attributes: this.parseAttributes(prefix),

            declaration: source.slice(
                declaration.start,
                declaration.bodyStart
            ).trim(),

            inheritance: inheritanceText.startsWith(":")
                ? DocsParser.splitTopLevel(
                    inheritanceText.slice(1)
                )
                : [],

            typeParameters:
                DocsParser.parseTypeParameters(
                    match[4],
                    xml.typeParameters
                ),

            members: [],

            nestedTypes: [],

            enumValues: [],

            line: this.getLineNumber(
                source,
                declaration.start
            )
        };

        // enumの場合は定義値を取得する。
        if (type.kind === "enum") {

            type.enumValues = this.parseEnumValues(
                source.slice(
                    declaration.bodyStart + 1,
                    declaration.bodyEnd
                )
            );
        }
        else {

            // クラスなどの場合は全メンバーを取得する。
            type.members = this.parseMembers(
                source,
                masked,
                declaration,
                type
            );
        }

        // 内部クラスを再帰的に解析する。
        type.nestedTypes = declaration.children.map(
            child => this.createType(
                source,
                masked,
                child,
                type
            )
        );

        return type;
    },

    /**
     * 型に直接所属するメンバーを解析する。
     * @param {string} source 元のソースコード
     * @param {string} masked マスク済みソースコード
     * @param {Object} declaration 型宣言情報
     * @param {Object} type 型情報
     * @returns {Array<Object>} メンバー一覧
     */
    parseMembers(source, masked, declaration, type) {

        const members = [];

        let start = declaration.bodyStart + 1;

        let roundDepth = 0;
        let squareDepth = 0;

        for (
            let i = start;
            i < declaration.bodyEnd;
            i++
        ) {

            const char = masked[i];

            if (char === "(") roundDepth++;
            if (char === ")") roundDepth--;

            if (char === "[") squareDepth++;
            if (char === "]") squareDepth--;

            // 引数や属性の内部は解析対象外。
            if (roundDepth !== 0 ||
                squareDepth !== 0) {
                continue;
            }

            if (char !== "{" && char !== ";") {
                continue;
            }

            const raw = source.slice(start, i);

            let block = "";

            if (char === "{") {

                const end = DocsParser.findClosing(
                    masked,
                    i,
                    "{",
                    "}"
                );

                if (end < 0) break;

                block = source.slice(i, end + 1);

                i = end;
            }

            // 既存パーサーを利用して
            // 非公開メンバーも含めて取得する。
            const member = DocsParser.parseMember(
                raw,
                block,
                type,
                true
            );

            if (member) {

                member.attributes =
                    this.parseAttributes(raw);

                member.initialValue =
                    member.kind === "field" ||
                    member.kind === "constant"
                        ? member.value || null
                        : null;

                member.inspector =
                    this.createInspectorInfo(member);

                members.push(member);
            }

            start = i + 1;
        }

        return members;
    },

    /**
     * 宣言直前の属性とコメントを取得する。
     *
     * 正規表現による過剰なバックトラッキングを防ぐため、
     * 宣言位置から行単位で逆方向に探索する。
     *
     * @param {string} source ソースコード
     * @param {number} index 宣言位置
     * @returns {string} 宣言前の文字列
     */
    getDeclarationPrefix(source, index) {

        const lines = source
            .slice(0, index)
            .split(/\r?\n/);

        const result = [];

        // 宣言直前の行から逆方向に探索する。
        for (let i = lines.length - 1; i >= 0; i--) {

            const line = lines[i];
            const text = line.trim();

            // 空行、コメント、プリプロセッサ、
            // 属性宣言を取得する。
            if (
                text === "" ||
                text.startsWith("//") ||
                text.startsWith("#") ||
                (
                    text.startsWith("[") &&
                    text.endsWith("]")
                )
            ) {
                result.push(line);
                continue;
            }

            // 通常のコードに到達したら探索を終了する。
            break;
        }

        // 元の記述順序に戻す。
        return result.reverse().join("\n");
    },

    /**
     * C#属性を抽出する。
     * @param {string} source 宣言文字列
     * @returns {Array<Object>} 属性一覧
     */
    parseAttributes(source) {

        const attributes = [];

        // コメントを除外する。
        const text = source
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");

        // 宣言先頭にある属性を取得する。
        const pattern = /^\s*\[([^\r\n]*)\]/gm;

        for (const match of text.matchAll(pattern)) {

            const entries = DocsParser.splitTopLevel(
                match[1]
            );

            for (const entry of entries) {

                const result = entry.trim().match(
                    /^([\w.]+)\s*(?:\(([\s\S]*)\))?$/
                );

                if (!result) continue;

                const name = result[1]
                    .split(".")
                    .pop()
                    .replace(/Attribute$/, "");

                const args =
                    DocsParser.splitTopLevel(
                        result[2] || ""
                    );

                attributes.push({

                    name,

                    arguments: args.map(value =>
                        this.parseAttributeValue(value)
                    ),

                    raw: entry.trim()
                });
            }
        }

        return attributes;
    },

    /**
     * 属性の引数を基本データ型へ変換する。
     * @param {string} value 属性の引数
     * @returns {*} 変換後の値
     */
    parseAttributeValue(value) {

        const text = value.trim();

        if (text.startsWith('"') &&
            text.endsWith('"')) {

            try {
                return JSON.parse(text);
            }
            catch {
                return text.slice(1, -1);
            }
        }

        if (text === "true") return true;
        if (text === "false") return false;
        if (text === "null") return null;

        const numeric = text.replace(/[fFdDmM]$/, "");

        if (numeric !== "" &&
            Number.isFinite(Number(numeric))) {

            return Number(numeric);
        }

        return text;
    },

    /**
     * 指定された属性を取得する。
     * @param {Object} member メンバー情報
     * @param {string} name 属性名
     * @returns {Object|undefined} 属性情報
     */
    getAttribute(member, name) {

        return (member.attributes || []).find(
            attribute => attribute.name === name
        );
    },

    /**
     * Inspector表示用の情報を生成する。
     *
     * Unityのシリアライズ条件の一部を利用して
     * 表示対象となるフィールド候補を判定する。
     *
     * @param {Object} member メンバー情報
     * @returns {Object|null} Inspector情報
     */
    createInspectorInfo(member) {

        // フィールド以外は表示しない。
        if (member.kind !== "field") {
            return null;
        }

        const modifiers = member.modifiers || [];

        // static、const、readonlyは対象外。
        if (
            modifiers.includes("static") ||
            modifiers.includes("const") ||
            modifiers.includes("readonly")
        ) {
            return null;
        }

        const serializeField = this.getAttribute(
            member,
            "SerializeField"
        );

        const serializeReference = this.getAttribute(
            member,
            "SerializeReference"
        );

        const hideInInspector = this.getAttribute(
            member,
            "HideInInspector"
        );

        const nonSerialized = this.getAttribute(
            member,
            "NonSerialized"
        );

        if (hideInInspector || nonSerialized) {
            return null;
        }

        // publicまたはSerializeFieldなどを持つ
        // フィールドを表示候補とする。
        if (
            member.accessibility !== "public" &&
            !serializeField &&
            !serializeReference
        ) {
            return null;
        }

        const header =
            this.getAttribute(member, "Header");

        const tooltip =
            this.getAttribute(member, "Tooltip");

        const range =
            this.getAttribute(member, "Range");

        const min =
            this.getAttribute(member, "Min");

        const space =
            this.getAttribute(member, "Space");

        const textArea =
            this.getAttribute(member, "TextArea");

        const multiline =
            this.getAttribute(member, "Multiline");

        return {

            visible: true,

            label: this.nicifyName(member.name),

            type: member.valueType,

            header: header?.arguments[0] ?? null,

            tooltip: tooltip?.arguments[0] ?? "",

            range: range
                ? {
                    min: range.arguments[0],
                    max: range.arguments[1]
                }
                : null,

            min: min?.arguments[0] ?? null,

            space: space
                ? space.arguments[0] ?? 8
                : null,

            textArea: Boolean(textArea),

            multiline: Boolean(multiline),

            serializeReference:
                Boolean(serializeReference),

            initialValue: member.initialValue
        };
    },

    /**
     * フィールド名をInspector風に変換する。
     * @param {string} name フィールド名
     * @returns {string} 表示名
     */
    nicifyName(name) {

        const value = name
            .replace(/^m_/, "")
            .replace(/^_+/, "")
            .replace(/_/g, " ")
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");

        return value.charAt(0).toUpperCase() +
            value.slice(1);
    },

    /**
     * enumの定義値を解析する。
     * @param {string} source enumの内部文字列
     * @returns {Array<Object>} 定義値一覧
     */
    parseEnumValues(source) {

        const text = source
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/[^\r\n]*/g, "");

        return DocsParser.splitTopLevel(text)
            .map(entry => {

                const match = entry.trim().match(
                    /^(\w+)\s*(?:=\s*([\s\S]+))?$/
                );

                if (!match) return null;

                return {

                    name: match[1],

                    value: match[2]?.trim() ?? null
                };
            })
            .filter(Boolean);
    },

    /**
     * ソースコード上の行番号を取得する。
     * @param {string} source ソースコード
     * @param {number} index 文字位置
     * @returns {number} 行番号
     */
    getLineNumber(source, index) {

        return source.slice(0, index)
            .split("\n").length;
    }
};