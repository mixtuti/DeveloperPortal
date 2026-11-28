/**
 * C#スクリプト解析システム Ver.2
 */
const DocsParser = {

    // 解析システムのバージョン
    version: 3,

    // C#の宣言に使用される修飾子
    modifiers: [
        "public", "private", "protected", "internal",
        "static", "abstract", "sealed", "partial",
        "virtual", "override", "new", "readonly",
        "const", "volatile", "async", "extern",
        "unsafe", "required"
    ],

    /**
     * C#ファイルを読み込んで解析する。
     * @param {File} file 対象ファイル
     * @returns {Promise<Object>} 解析結果
     */
    async parseFile(file) {
        return this.parse(await file.text(), file.name);
    },

    /**
     * C#ソースコードを解析する。
     * @param {string} source ソースコード
     * @param {string} fileName ファイル名
     * @returns {Object} スクリプト情報
     */
    parse(source, fileName) {

        const masked = this.maskSource(source);
        const namespace = this.parseNamespace(masked);
        const type = this.parseType(source, masked, fileName);

        const members = this.parseMembers(
            source,
            masked,
            type
        );

        return {
            parserVersion: this.version,

            id: namespace
                ? `${namespace}.${type.name}`
                : type.name,

            name: type.name,
            fileName,
            namespace,

            type: type.kind,
            accessibility: type.accessibility,
            modifiers: type.modifiers,

            declaration: type.declaration,
            typeParameters: type.typeParameters,

            summary: type.summary,
            remarks: type.remarks,

            inheritance: type.inheritance,
            
            dependencies: this.parseDependencies(
                masked,
                type
            ),

            members,

            // スクリプト内に定義された全型の情報
            types: DocsTypeParser.parse(source),

            source,

            tips: [],
            examples: [],
            notes: [],
            related: [],
            tests: [],

            generatedAt: new Date().toISOString()
        };
    },

    /**
     * コメントと文字列を空白に置換する。
     * 元の文字位置と改行位置は維持する。
     */
    maskSource(source) {

        const pattern =
            /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|@"(?:[^"]|"")*"|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;

        return source.replace(pattern, value =>
            value.replace(/[^\r\n]/g, " ")
        );
    },

    /**
     * 名前空間を取得する。
     */
    parseNamespace(source) {

        const match = source.match(
            /\bnamespace\s+([\w.]+)\s*[;{]/
        );

        return match?.[1] || "";
    },

    /**
     * 修飾子とアクセス修飾子を分離する。
     */
    parseModifiers(value) {

        const words = value.trim()
            .split(/\s+/)
            .filter(Boolean);

        const access = [
            "public",
            "private",
            "protected",
            "internal"
        ];

        return {
            accessibility: words.filter(
                word => access.includes(word)
            ).join(""),

            modifiers: words.filter(
                word => !access.includes(word)
            )
        };
    },

    /**
     * クラスなどの型宣言を解析する。
     */
    parseType(source, masked, fileName) {

        const pattern =
            /((?:(?:public|private|protected|internal|static|abstract|sealed|partial|readonly|unsafe|new|ref)\s+)*)\b(class|interface|struct|enum|record(?:\s+struct|\s+class)?)\s+(\w+)\s*(<[^{};]*?>)?([^{};]*)\{/g;

        const matches = [...masked.matchAll(pattern)];

        if (!matches.length) {
            throw new Error("型宣言を検出できませんでした。");
        }

        // ファイル名と一致する型を優先する。
        const expectedName = fileName.replace(/\.cs$/i, "");

        const match = matches.find(
            item => item[3] === expectedName
        ) || matches[0];

        const modifierInfo = this.parseModifiers(match[1]);

        const declaration = source.slice(
            match.index,
            match.index + match[0].length - 1
        ).trim();

        const bodyStart =
            match.index + match[0].length - 1;

        const bodyEnd = this.findClosing(
            masked,
            bodyStart,
            "{",
            "}"
        );

        if (bodyEnd < 0) {
            throw new Error("型宣言の終了位置を検出できません。");
        }

        // where制約を除外して継承情報を取得する。
        const inheritanceText = match[5]
            .split(/\bwhere\b/)[0]
            .trim();

        const inheritance = inheritanceText.startsWith(":")
            ? this.splitTopLevel(inheritanceText.slice(1))
            : [];

        const xml = this.parseXml(
            this.getXmlBefore(source, match.index)
        );

        return {
            name: match[3],
            kind: match[2],

            ...modifierInfo,

            accessibility:
                modifierInfo.accessibility || "internal",

            declaration,

            typeParameters: this.parseTypeParameters(
                match[4],
                xml.typeParameters
            ),

            inheritance,

            bodyStart,
            bodyEnd,

            summary: xml.summary,
            remarks: xml.remarks
        };
    },

    /**
     * メンバー宣言の先頭からコメントと属性を除去する。
     *
     * 連続した属性や複数行の属性にも対応する。
     * 配列型など、宣言本体に含まれる角括弧は維持する。
     *
     * @param {string} source メンバー宣言
     * @returns {string} 属性を除去した宣言
     */
    stripMemberPrefix(source) {

        // コメントや文字列の内部を解析対象から除外する。
        const masked = this.maskSource(source);

        let index = 0;

        while (index < masked.length) {

            const char = masked[index];

            // 空白とコメントを読み飛ばす。
            if (/\s/.test(char)) {
                index++;
                continue;
            }

            // プリプロセッサ行を読み飛ばす。
            if (char === "#") {

                while (
                    index < masked.length &&
                    masked[index] !== "\n"
                ) {
                    index++;
                }

                continue;
            }

            // 属性の開始位置を検出する。
            if (char === "[") {

                const end = this.findClosing(
                    masked,
                    index,
                    "[",
                    "]"
                );

                // 閉じ括弧が見つからない場合は終了する。
                if (end < 0) break;

                index = end + 1;

                continue;
            }

            // メンバー宣言本体に到達したら終了する。
            break;
        }

        return source.slice(index).trim();
    },

    /**
     * 対応する閉じ括弧の位置を取得する。
     */
    findClosing(source, start, open, close) {

        let depth = 0;

        for (let i = start; i < source.length; i++) {

            if (source[i] === open) depth++;

            if (source[i] === close) {

                depth--;

                if (depth === 0) return i;
            }
        }

        return -1;
    },

    /**
     * using宣言と継承情報を取得する。
     */
    parseDependencies(source, type) {

        const imports = [...source.matchAll(
            /\busing\s+(?:static\s+)?([\w.]+)\s*;/g
        )].map(match => match[1]);

        return [...new Set([
            ...imports,
            ...type.inheritance
        ])];
    },

    /**
     * 型の直下に存在する公開メンバーを解析する。
     */
    parseMembers(source, masked, type) {

        const members = [];

        let start = type.bodyStart + 1;
        let roundDepth = 0;
        let squareDepth = 0;

        for (let i = start; i < type.bodyEnd; i++) {

            const char = masked[i];

            if (char === "(") roundDepth++;
            if (char === ")") roundDepth--;

            if (char === "[") squareDepth++;
            if (char === "]") squareDepth--;

            if (roundDepth !== 0 || squareDepth !== 0) {
                continue;
            }

            if (char !== "{" && char !== ";") {
                continue;
            }

            const declaration = source.slice(start, i);

            let block = "";

            // メソッド本体やプロパティ本体を飛ばす。
            if (char === "{") {

                const end = this.findClosing(
                    masked, i, "{", "}"
                );

                if (end < 0) break;

                block = source.slice(i, end + 1);

                i = end;
            }

            const member = this.parseMember(
                declaration,
                block,
                type
            );

            if (member) members.push(member);

            start = i + 1;
        }

        return members;
    },

    /**
     * 個別メンバーの宣言を解析する。
     */
    parseMember(raw, block, type, includeAll = false) {

        const xml = this.parseXml(
            [...raw.matchAll(/^\s*\/\/\/(.*)$/gm)]
                .map(match => match[1])
                .join("\n")
        );

        // コメント・属性・プリプロセッサ行を除去する。
        const signature = this.stripMemberPrefix(raw);

        if (!signature) return null;

        const modifierPattern = new RegExp(
            `^(?:(?:${this.modifiers.join("|")})\\s+)*`
        );

        const prefix =
            signature.match(modifierPattern)?.[0] || "";

        const info = this.parseModifiers(prefix);

        // アクセス修飾子が省略された場合の既定値
        const accessibility = info.accessibility ||
            (type.kind === "interface" ? "public" : "private");

        // 公開API解析の場合はpublicのみ取得する。
        // 全メンバー解析の場合はprivateなども取得する。
        if (!includeAll && accessibility !== "public") {
            return null;
        }

        const declaration = signature.slice(prefix.length).trim();

        // ネストされた型は今回の対象外とする。
        if (/^(class|struct|interface|enum|record)\b/.test(
            declaration
        )) {
            return null;
        }

        const member = {
            name: "",
            kind: "member",

            accessibility: accessibility,
            modifiers: info.modifiers,

            signature,

            returnType: "",
            valueType: "",
            value: "",

            parameters: [],
            typeParameters: [],

            accessors: [],

            summary: xml.summary,
            returns: xml.returns,
            remarks: xml.remarks,
            exceptions: xml.exceptions
        };

        // メソッド・コンストラクタを解析する。
        const open = declaration.indexOf("(");
        const equal = declaration.indexOf("=");

        if (open >= 0 && (equal < 0 || open < equal)) {

            const close = this.findClosing(
                declaration, open, "(", ")"
            );

            if (close < 0) return null;

            const head = declaration
                .slice(0, open)
                .trim();

            const match = head.match(
                /(\w+)\s*(<[\s\S]*>)?$/
            );

            if (!match) return null;

            member.name = match[1];

            member.kind = member.name === type.name
                ? "constructor"
                : "method";

            member.returnType =
                member.kind === "constructor"
                    ? ""
                    : head.slice(0, match.index).trim();

            member.typeParameters =
                this.parseTypeParameters(
                    match[2],
                    xml.typeParameters
                );

            member.parameters = this.parseParameters(
                declaration.slice(open + 1, close),
                xml.parameters
            );

            return member;
        }

        // 式形式プロパティを解析する。
        const arrow = declaration.indexOf("=>");

        if (arrow >= 0 && (equal < 0 || arrow === equal)) {

            const head = declaration.slice(0, arrow).trim();
            const match = head.match(/([\s\S]+?)\s+(\w+)$/);

            if (!match) return null;

            member.kind = "property";
            member.valueType = match[1];
            member.name = match[2];
            member.accessors = ["get"];

            return member;
        }

        // フィールド・定数・プロパティを解析する。
        const parts = declaration.match(
            /^([\s\S]+?)\s+(\w+)\s*(?:=\s*([\s\S]*))?$/
        );

        if (!parts) return null;

        member.valueType = parts[1].trim();
        member.name = parts[2];
        member.value = parts[3]?.trim() || "";

        if (info.modifiers.includes("const")) {

            member.kind = "constant";

        } else if (member.valueType.startsWith("event ")) {

            member.kind = "event";
            member.valueType = member.valueType
                .replace(/^event\s+/, "");

        } else if (block) {

            member.kind = "property";

            member.accessors = [
                ...this.maskSource(block).matchAll(
                    /\b(?:(private|protected|internal)\s+)?(get|set|init)\s*(?:;|{|=>)/g
                )
            ].map(match =>
                [match[1], match[2]]
                    .filter(Boolean)
                    .join(" ")
            );

        } else {

            member.kind = "field";
        }

        return member;
    },

    /**
     * 引数の型・名前・初期値を解析する。
     */
    parseParameters(value, descriptions = {}) {

        return this.splitTopLevel(value).map(parameter => {

            const parts = this.splitTopLevel(parameter, "=");

            const declaration = parts.shift().trim();

            const defaultValue = parts.length
                ? parts.join("=").trim()
                : null;

            const match = declaration.match(
                /^([\s\S]+?)\s+(@?\w+)$/
            );

            if (!match) {

                return {
                    name: declaration,
                    type: "",
                    modifier: "",
                    defaultValue,
                    description: ""
                };
            }

            const name = match[2];

            let type = match[1].trim();

            const modifier = type.match(
                /^(?:(?:ref|out|in|params|this|scoped)\s+)+/
            )?.[0]?.trim() || "";

            if (modifier) {
                type = type.slice(modifier.length).trim();
            }

            return {
                name,
                type,
                modifier,
                defaultValue,
                description: descriptions[name] || ""
            };
        });
    },

    /**
     * ジェネリック型パラメータを解析する。
     */
    parseTypeParameters(value, descriptions = {}) {

        if (!value) return [];

        return this.splitTopLevel(
            value.trim().replace(/^<|>$/g, "")
        ).map(name => ({
            name,
            description: descriptions[name] || ""
        }));
    },

    /**
     * 括弧内部の区切り文字を無視して分割する。
     * ジェネリック型や配列などに対応する。
     */
    splitTopLevel(value, separator = ",") {

        if (!value?.trim()) return [];

        const masked = this.maskSource(value);

        const result = [];

        let start = 0;

        let angle = 0;
        let round = 0;
        let square = 0;
        let curly = 0;

        for (let i = 0; i < masked.length; i++) {

            const char = masked[i];

            if (char === "<") angle++;
            if (char === ">") angle = Math.max(0, angle - 1);

            if (char === "(") round++;
            if (char === ")") round--;

            if (char === "[") square++;
            if (char === "]") square--;

            if (char === "{") curly++;
            if (char === "}") curly--;

            if (
                char === separator &&
                angle === 0 &&
                round === 0 &&
                square === 0 &&
                curly === 0
            ) {

                result.push(
                    value.slice(start, i).trim()
                );

                start = i + 1;
            }
        }

        result.push(value.slice(start).trim());

        return result.filter(Boolean);
    },

    /**
     * 型宣言直前のXMLコメントを取得する。
     */
    getXmlBefore(source, index) {

        const before = source.slice(0, index);

        const match = before.match(
            /((?:[ \t]*\/\/\/[^\r\n]*\r?\n)+)(?:\s*\[[^\n]*\]\s*)*\s*$/
        );

        return match
            ? match[1].replace(/^\s*\/\/\/\s?/gm, "")
            : "";
    },

    /**
     * XMLドキュメントコメントを解析する。
     */
    parseXml(value) {

        const xml = new DOMParser().parseFromString(
            `<root>${value || ""}</root>`,
            "application/xml"
        );

        const result = {
            summary: "",
            parameters: {},
            typeParameters: {},
            returns: "",
            remarks: "",
            exceptions: []
        };

        if (xml.querySelector("parsererror")) {
            return result;
        }

        const root = xml.documentElement;

        // 単一の説明文を取得する。
        const getText = tag =>
            this.cleanText(
                root.querySelector(tag)
            );

        result.summary = getText("summary");
        result.returns = getText("returns");
        result.remarks = getText("remarks");

        // 引数の説明を取得する。
        root.querySelectorAll("param").forEach(node => {

            const name = node.getAttribute("name");

            if (name) {
                result.parameters[name] =
                    this.cleanText(node);
            }
        });

        // 型パラメータの説明を取得する。
        root.querySelectorAll("typeparam").forEach(node => {

            const name = node.getAttribute("name");

            if (name) {
                result.typeParameters[name] =
                    this.cleanText(node);
            }
        });

        // 例外情報を取得する。
        root.querySelectorAll("exception").forEach(node => {

            result.exceptions.push({
                name: node.getAttribute("cref") || "",
                description: this.cleanText(node)
            });
        });

        return result;
    },

    /**
     * XMLコメント内の不要な空白を整理する。
     * seeやparamrefなどの参照情報も文字列化する。
     */
    cleanText(node) {

        if (!node) return "";

        const copy = node.cloneNode(true);

        copy.querySelectorAll(
            "see, seealso, paramref, typeparamref"
        ).forEach(element => {

            const value =
                element.textContent ||
                element.getAttribute("cref") ||
                element.getAttribute("name") ||
                element.getAttribute("langword") ||
                "";

            element.replaceWith(
                copy.ownerDocument.createTextNode(value)
            );
        });

        return copy.textContent
            .replace(/\s+/g, " ")
            .trim();
    }
};