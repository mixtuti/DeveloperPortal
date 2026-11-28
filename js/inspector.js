/**
 * Unity Inspectorシミュレーター
 *
 * C# Parserが生成した型情報を利用して、
 * Unity風のInspectorをブラウザ上に再現する。
 */
const DocsInspector = {

    /**
     * HTML特殊文字をエスケープする。
     * @param {*} value 変換対象
     * @returns {string} 変換後の文字列
     */
    escape(value) {

        return String(value ?? "").replace(
            /[&<>"']/g,
            char => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[char]
        );
    },

    /**
     * Inspectorの表示対象となる型を取得する。
     * @param {Object} script スクリプト情報
     * @returns {Array<Object>} 型情報一覧
     */
    getTypes(script) {

        const types = script.types ||
            (
                script.source
                    ? DocsTypeParser.parse(script.source)
                    : []
            );

        // MonoBehaviourとScriptableObjectを対象とする。
        return types.filter(type =>

            (type.inheritance || []).some(base =>
                /(?:^|\.)(MonoBehaviour|ScriptableObject)$/
                    .test(base.trim())
            )
        );
    },

    /**
     * Inspectorに表示するフィールドを取得する。
     * @param {Object} type 型情報
     * @returns {Array<Object>} フィールド一覧
     */
    getFields(type) {

        return (type.members || []).filter(
            member => member.inspector?.visible
        );
    },

    /**
     * Inspectorセクションを生成する。
     * @param {Object} script スクリプト情報
     * @returns {string} 生成したHTML
     */
    render(script) {

        const types = this.getTypes(script);

        if (!types.length) return "";

        return `

            <h2 id="ref-inspector">
                Inspector
            </h2>

            <p class="muted">
                Unity Inspectorのシミュレーターです。
                設定値の変更は実際のUnityには反映されません。
            </p>

            ${types.map(type =>
                this.renderComponent(type)
            ).join("")}
        `;
    },

    /**
     * コンポーネント単位のInspectorを生成する。
     * @param {Object} type 型情報
     * @returns {string} 生成したHTML
     */
    renderComponent(type) {

        const fields = this.getFields(type);

        const componentName =
            DocsTypeParser.nicifyName(type.name);

        return `

            <div class="unity-inspector">

                <div class="unity-inspector-title">
                    <span>ⓘ Inspector</span>
                </div>

                <details class="unity-component" open>

                    <summary class="unity-component-header">

                        <span class="unity-script-icon">
                            C#
                        </span>

                        <span class="unity-component-name">
                            ${this.escape(componentName)}
                            (Script)
                        </span>

                    </summary>

                    <div class="unity-component-body">

                        <div class="unity-inspector-row">

                            <label class="unity-field-label
                                          unity-disabled-label">
                                Script
                            </label>

                            <div class="unity-object-field
                                        unity-disabled-field">

                                <span class="unity-script-icon">
                                    C#
                                </span>

                                <span>
                                    ${this.escape(type.name)}
                                </span>

                                <span class="unity-object-picker">
                                    ◉
                                </span>

                            </div>

                        </div>

                        ${fields.map((field, index) =>
                            this.renderField(field, index)
                        ).join("")}

                        ${!fields.length ? `
                            <div class="unity-empty">
                                表示対象のフィールドはありません。
                            </div>
                        ` : ""}

                    </div>

                </details>

                <div class="unity-inspector-footer">

                    <button
                        type="button"
                        class="unity-button"
                        data-inspector-reset
                    >
                        Reset
                    </button>

                </div>

            </div>
        `;
    },

    /**
     * フィールド単位の表示を生成する。
     * @param {Object} member メンバー情報
     * @param {number} index フィールド番号
     * @returns {string} 生成したHTML
     */
    renderField(member, index) {

        const info = member.inspector;

        const space = Number(info.space);

        const spacing =
            info.space !== null &&
            info.space !== undefined &&
            Number.isFinite(space)
                ? Math.max(0, Math.min(space, 100))
                : 0;

        return `

            ${spacing > 0 ? `
                <div style="height:${spacing}px"></div>
            ` : ""}

            ${info.header ? `
                <div class="unity-field-header">
                    ${this.escape(info.header)}
                </div>
            ` : ""}

            <div class="unity-inspector-row">

                <label
                    class="unity-field-label"
                    title="${this.escape(info.tooltip || "")}"
                >
                    ${this.escape(info.label || member.name)}
                </label>

                <div class="unity-field-control">

                    ${this.renderControl(member, index)}

                </div>

            </div>
        `;
    },

    /**
     * C#の初期値を基本データ型へ変換する。
     * 複雑な式の評価は行わない。
     *
     * @param {Object} member メンバー情報
     * @returns {*} 変換後の初期値
     */
    getDefaultValue(member) {

        const type = member.valueType;

        const raw = member.initialValue;

        if (type === "bool") {

            return raw === "true";
        }

        if (this.isNumeric(type)) {

            const text = String(raw ?? "0")
                .replace(/_/g, "")
                .replace(/[fFdDmMuUlL]+$/, "");

            const value = Number(text);

            return Number.isFinite(value)
                ? value
                : null;
        }

        if (type === "string") {

            if (raw === null ||
                raw === undefined ||
                raw === "null") {

                return "";
            }

            try {

                const value = JSON.parse(raw);

                return typeof value === "string"
                    ? value
                    : raw;
            }
            catch {

                return raw;
            }
        }

        return raw ?? "";
    },

    /**
     * 数値型かどうかを判定する。
     * @param {string} type C#の型名
     * @returns {boolean} 判定結果
     */
    isNumeric(type) {

        return [
            "byte", "sbyte",
            "short", "ushort",
            "int", "uint",
            "long", "ulong",
            "float", "double"
        ].includes(type);
    },

    /**
     * 整数型かどうかを判定する。
     * @param {string} type C#の型名
     * @returns {boolean} 判定結果
     */
    isInteger(type) {

        return [
            "byte", "sbyte",
            "short", "ushort",
            "int", "uint",
            "long", "ulong"
        ].includes(type);
    },

    /**
     * フィールドの型に応じた入力欄を生成する。
     * @param {Object} member メンバー情報
     * @param {number} index フィールド番号
     * @returns {string} 生成したHTML
     */
    renderControl(member, index) {

        const info = member.inspector;

        const type = member.valueType;

        const value = this.getDefaultValue(member);

        const common = `
            data-inspector-field="${index}"
            data-field-name="${this.escape(member.name)}"
            data-default="${this.escape(value)}"
            aria-label="${this.escape(info.label)}"
        `;

        // bool型：チェックボックス
        if (type === "bool") {

            return `
                <input
                    type="checkbox"
                    class="unity-checkbox"
                    ${common}
                    ${value ? "checked" : ""}
                >
            `;
        }

        // 数値型
        if (this.isNumeric(type)) {

            // 評価できない初期値は式として表示する。
            if (value === null) {

                return `
                    <div
                        class="unity-object-field"
                        title="初期値の式を評価できません"
                    >
                        ${this.escape(member.initialValue)}
                    </div>
                `;
            }

            const step = this.isInteger(type)
                ? "1"
                : "any";

            const range = info.range;

            // Range属性：スライダーと数値入力
            if (
                range &&
                typeof range.min === "number" &&
                typeof range.max === "number" &&
                range.min <= range.max
            ) {

                const rangeValue = Math.max(
                    range.min,
                    Math.min(range.max, value)
                );

                return `

                    <div class="unity-range-control">

                        <input
                            type="range"
                            class="unity-slider"
                            data-inspector-slider
                            min="${range.min}"
                            max="${range.max}"
                            step="${step}"
                            value="${rangeValue}"
                        >

                        <input
                            type="number"
                            class="unity-input unity-range-value"
                            ${common}
                            data-default="${rangeValue}"
                            min="${range.min}"
                            max="${range.max}"
                            step="${step}"
                            value="${rangeValue}"
                        >

                    </div>
                `;
            }

            // Min属性：数値入力の最小値
            const min =
                typeof info.min === "number"
                    ? `min="${info.min}"`
                    : "";

            return `

                <input
                    type="number"
                    class="unity-input"
                    ${common}
                    ${min}
                    step="${step}"
                    value="${this.escape(value)}"
                >
            `;
        }

        // string型
        if (type === "string") {

            // TextArea・Multiline属性
            if (info.textArea || info.multiline) {

                return `

                    <textarea
                        class="unity-textarea"
                        ${common}
                        rows="3"
                    >${this.escape(value)}</textarea>
                `;
            }

            return `

                <input
                    type="text"
                    class="unity-input"
                    ${common}
                    value="${this.escape(value)}"
                >
            `;
        }

        // 未対応の型は読み取り専用で表示する。
        return `

            <div
                class="unity-object-field"
                title="この型の編集にはまだ対応していません"
            >

                <span>
                    ${this.escape(
                        value || `(${type})`
                    )}
                </span>

                <span class="unity-object-picker">
                    ◉
                </span>

            </div>
        `;
    },

    /**
     * 数値入力を指定された範囲に収める。
     * @param {HTMLInputElement} input 数値入力欄
     */
    clampNumber(input) {

        if (input.value === "") return;

        let value = Number(input.value);

        if (!Number.isFinite(value)) return;

        if (input.min !== "") {

            value = Math.max(
                Number(input.min),
                value
            );
        }

        if (input.max !== "") {

            value = Math.min(
                Number(input.max),
                value
            );
        }

        if (input.step === "1") {

            value = Math.round(value);
        }

        input.value = value;
    },

    /**
     * Inspectorの操作イベントを登録する。
     * @param {HTMLElement} container 表示コンテナ
     */
    bind(container) {

        container.querySelectorAll(
            ".unity-inspector"
        ).forEach(inspector => {

            // Rangeのスライダーと数値入力を同期する。
            inspector.querySelectorAll(
                ".unity-range-control"
            ).forEach(control => {

                const slider = control.querySelector(
                    "[data-inspector-slider]"
                );

                const input = control.querySelector(
                    "[data-inspector-field]"
                );

                slider.oninput = () => {

                    input.value = slider.value;
                };

                input.oninput = () => {

                    slider.value = input.value;
                };
            });

            // 数値入力の確定時に範囲を補正する。
            inspector.querySelectorAll(
                'input[type="number"]'
            ).forEach(input => {

                input.onchange = () => {

                    this.clampNumber(input);

                    const slider = input.parentElement
                        .querySelector(
                            "[data-inspector-slider]"
                        );

                    if (slider) {

                        slider.value = input.value;
                    }
                };
            });

            // Resetボタン
            const reset = inspector.querySelector(
                "[data-inspector-reset]"
            );

            if (reset) {

                reset.onclick = () => {

                    this.reset(inspector);
                };
            }
        });
    },

    /**
     * Inspectorの値を初期状態に戻す。
     * @param {HTMLElement} inspector Inspector要素
     */
    reset(inspector) {

        inspector.querySelectorAll(
            "[data-inspector-field]"
        ).forEach(input => {

            const value = input.dataset.default;

            if (input.type === "checkbox") {

                input.checked = value === "true";
            }
            else {

                input.value = value;
            }

            if (input.type === "number") {

                this.clampNumber(input);
            }

            const slider = input.parentElement
                .querySelector(
                    "[data-inspector-slider]"
                );

            if (slider) {

                slider.value = input.value;
            }
        });
    }
};