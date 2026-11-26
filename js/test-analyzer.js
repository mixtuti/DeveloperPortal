/**
 * テストスクリプトの解析を管理する。
 *
 * ソースコードから検証項目や動作確認項目を抽出する。
 * テストの実行や成功・失敗の判定は行わない。
 */
const DocsTestAnalyzer = {

    /**
     * テストスクリプトか判定する。
     * @param {Object} script スクリプト情報
     * @returns {boolean} テストスクリプトか
     */
    isTestScript(script) {

        const source = DocsParser.maskSource(
            script.source || ""
        );

        // クラス名による判定
        const isTestName =
            /Tests?$/i.test(script.name || "");

        // 名前空間による判定
        const isTestNamespace =
            /(?:^|\.)Tests?(?:\.|$)/i.test(
                script.namespace || ""
            );

        // NUnit・Unity Test Frameworkの属性による判定
        const hasTestAttribute =
            /\[\s*(?:Test|TestCase|UnityTest|TestFixture)\b/
                .test(source);

        return isTestName ||
            isTestNamespace ||
            hasTestAttribute;
    },

    /**
     * テスト情報を解析する。
     * @param {Object} script スクリプト情報
     * @returns {Object} テスト解析結果
     */
    analyze(script) {

        const source = script.source || "";

        const assertions = this.extractAssertions(source);

        const testMethods = this.extractTestMethods(source);

        const observations =
            this.extractObservations(source);

        return {

            isTest: this.isTestScript(script),

            targets: this.getTargets(script),

            items: [...assertions, ...testMethods],

            observations
        };
    },

    /**
     * テスト対象となるスクリプト候補を取得する。
     * @param {Object} script テストスクリプト
     * @returns {Array<Object>} テスト対象候補
     */
    getTargets(script) {

        const dependencies =
            DocsDependency.getDependencies(script.id);

        const targets = dependencies
            .map(relation => relation.script)
            .filter(target =>
                target && !this.isTestScript(target)
            );

        // GridMapTest → GridMap のように
        // クラス名が一致する候補を優先する。
        const expectedName = script.name.replace(
            /Tests?$/i,
            ""
        );

        const matched = targets.filter(
            target => target.name === expectedName
        );

        return matched.length ? matched : targets;
    },

    /**
     * Assertによる検証項目を抽出する。
     * @param {string} source C#ソースコード
     * @returns {Array<Object>} 検証項目一覧
     */
    extractAssertions(source) {

        const masked = DocsParser.maskSource(source);

        const pattern =
            /\b(Debug\.Assert|Assert\.\w+)\s*\(/g;

        const items = [];

        for (const match of masked.matchAll(pattern)) {

            const open =
                match.index + match[0].length - 1;

            const close = DocsParser.findClosing(
                masked,
                open,
                "(",
                ")"
            );

            if (close < 0) continue;

            // Assertの引数を取得する。
            const argumentsText = source.slice(
                open + 1,
                close
            );

            const args =
                DocsParser.splitTopLevel(argumentsText);

            const condition = args[0] || "";

            // Debug.Assertの場合は第2引数が
            // 失敗時のメッセージとなる。
            const message = match[1] === "Debug.Assert"
                ? this.getStringLiteral(args[1])
                : "";

            const comment = this.getPreviousComment(
                source,
                match.index
            );

            const title = message
                ? this.cleanMessage(message)
                : comment || condition || match[1];

            items.push({

                title,

                method: match[1],

                condition: argumentsText.trim(),

                message,

                line: this.getLineNumber(
                    source,
                    match.index
                )
            });
        }

        return items;
    },

    /**
     * NUnit・UnityTestのテストメソッドを抽出する。
     * @param {string} source C#ソースコード
     * @returns {Array<Object>} テストメソッド一覧
     */
    extractTestMethods(source) {

        const masked = DocsParser.maskSource(source);

        const pattern =
            /\[\s*(Test|TestCase|UnityTest)\b[^\]]*\](?:\s*\[[^\]]*\])*\s*(?:(?:public|private|protected|internal|static|async)\s+)*[\w.<>,\[\]\s]+\s+(\w+)\s*\(/g;

        const items = [];

        for (const match of masked.matchAll(pattern)) {

            const xml = DocsParser.parseXml(
                DocsParser.getXmlBefore(
                    source,
                    match.index
                )
            );

            items.push({

                title: xml.summary || match[2],

                method: match[1],

                condition: "",

                message: "",

                line: this.getLineNumber(
                    source,
                    match.index
                )
            });
        }

        return items;
    },

    /**
     * XMLコメントから動作確認項目を抽出する。
     * @param {string} source C#ソースコード
     * @returns {Array<Object>} 動作確認項目一覧
     */
    extractObservations(source) {

        const masked = DocsParser.maskSource(source);

        const pattern =
            /\b(?:public|private|protected|internal)\s+(?:(?:static|async|virtual|override)\s+)*[\w.<>,\[\]]+\s+(\w+)\s*\(/g;

        const items = [];

        for (const match of masked.matchAll(pattern)) {

            const xml = DocsParser.parseXml(
                DocsParser.getXmlBefore(
                    source,
                    match.index
                )
            );

            if (!xml.summary) continue;

            const open =
                match.index + match[0].length - 1;

            const close = DocsParser.findClosing(
                masked,
                open,
                "(",
                ")"
            );

            if (close < 0) continue;

            // メソッド本体の開始位置を確認する。
            const rest = masked.slice(close + 1);

            const bodyMatch = rest.match(/^\s*\{/);

            if (!bodyMatch) continue;

            const bodyStart =
                close + bodyMatch[0].length;

            const bodyEnd = DocsParser.findClosing(
                masked,
                bodyStart,
                "{",
                "}"
            );

            if (bodyEnd < 0) continue;

            const body = masked.slice(
                bodyStart,
                bodyEnd
            );

            // Assertを含むメソッドは
            // 検証項目側で表示するため除外する。
            if (/\b(?:Debug\.Assert|Assert\.\w+)\s*\(/
                .test(body)) {
                continue;
            }

            items.push({

                title: xml.summary,

                method: match[1],

                line: this.getLineNumber(
                    source,
                    match.index
                )
            });
        }

        return items;
    },

    /**
     * 文字列リテラルから内容を取得する。
     * @param {string} value 引数の文字列
     * @returns {string} 文字列の内容
     */
    getStringLiteral(value) {

        if (!value) return "";

        const match = value.trim().match(
            /^"([\s\S]*)"$/
        );

        return match ? match[1] : "";
    },

    /**
     * 失敗メッセージを項目名へ変換する。
     * @param {string} message 失敗メッセージ
     * @returns {string} 整形後の項目名
     */
    cleanMessage(message) {

        return message.replace(
            /(?:に失敗しました|に失敗|が失敗しました|が失敗)[。！!]?$/,
            ""
        ).trim();
    },

    /**
     * 対象行の直前にあるコメントを取得する。
     * @param {string} source ソースコード
     * @param {number} index 対象位置
     * @returns {string} コメント
     */
    getPreviousComment(source, index) {

        const before = source.slice(0, index);

        const match = before.match(
            /(?:^|\n)[ \t]*\/\/(?!\/)([^\r\n]*)\r?\n[ \t]*$/
        );

        return match ? match[1].trim() : "";
    },

    /**
     * ソースコード上の行番号を取得する。
     * @param {string} source ソースコード
     * @param {number} index 対象位置
     * @returns {number} 行番号
     */
    getLineNumber(source, index) {

        return source.slice(0, index)
            .split("\n").length;
    }
};