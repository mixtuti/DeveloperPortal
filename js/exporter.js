/**
 * ドキュメントデータのJSON出力を管理する。
 */
const DocsExporter = {

    // 選択された出力先フォルダ
    rootHandle: null,

    /**
     * 出力先のルートフォルダを選択する。
     */
    async selectDirectory() {

        if (!window.showDirectoryPicker) {
            throw new Error(
                "このブラウザはフォルダへの直接保存に対応していません。"
            );
        }

        this.rootHandle = await window.showDirectoryPicker({
            mode: "readwrite"
        });

        return this.rootHandle;
    },

    /**
     * スクリプト情報からJSONの出力パスを生成する。
     * @param {Object} script スクリプト情報
     * @returns {string} 相対パス
     */
    getScriptPath(script) {

        const namespace = script.namespace
            ? script.namespace.replace(/\./g, "/") + "/"
            : "";

        return `scripts/${namespace}${script.name}.json`;
    },

    /**
     * 指定されたパスにJSONファイルを書き込む。
     * 存在しないフォルダは自動生成する。
     * @param {string} path 出力先パス
     * @param {Object} data 出力データ
     */
    async writeJson(path, data) {

        if (!this.rootHandle) {
            throw new Error("出力先が選択されていません。");
        }

        const parts = path.split("/");
        const fileName = parts.pop();

        let directory = this.rootHandle;

        for (const part of parts) {
            directory = await directory.getDirectoryHandle(
                part,
                { create: true }
            );
        }

        const fileHandle = await directory.getFileHandle(
            fileName,
            { create: true }
        );

        const writable = await fileHandle.createWritable();

        await writable.write(
            JSON.stringify(data, null, 4)
        );

        await writable.close();
    },

    /**
     * 全スクリプトとmanifest.jsonを出力する。
     * @returns {Promise<number>} 出力したスクリプト数
     */
    async exportAll() {

        const scripts = structuredClone(DocsData.getAll());

        const manifest = {
            schemaVersion: 1,
            scripts: []
        };

        // 各スクリプトを個別のJSONとして保存する。
        for (const script of scripts) {

            const path = this.getScriptPath(script);

            await this.writeJson(
                `data/${path}`,
                script
            );

            manifest.scripts.push(path);
        }

        // 全スクリプトの保存完了後にmanifestを更新する。
        await this.writeJson(
            "data/manifest.json",
            manifest
        );

        // 保存中にデータが変更されていない場合のみ保存済みにする。
        DocsData.isDirty =
            JSON.stringify(scripts) !==
            JSON.stringify(DocsData.getAll());

        return scripts.length;
    }
};