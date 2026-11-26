// 登録されているスクリプト情報
let scripts = [];

// 現在選択されているスクリプトID
let selectedId = null;

/**
 * サイトの初期化処理
 */
async function initialize() {
    try {
        // JSONファイルの登録一覧を取得する。
        const manifest = await loadJson("data/manifest.json");

        // 各スクリプトのJSONを並列で読み込む。
        scripts = await Promise.all(
            manifest.scripts.map(path => loadJson(`data/${path}`))
        );

        // スクリプト一覧を生成する。
        renderScriptList(scripts);

        if (scripts.length > 0) {
            showScript(scripts[0].id);
        }
    } catch (error) {
        document.getElementById("content").textContent = error.message;
    }
}

/**
 * 指定されたJSONファイルを読み込む。
 * @param {string} path JSONファイルのパス
 * @returns {Promise<Object>} JSONデータ
 */
async function loadJson(path) {
    const response = await fetch(path);

    if (!response.ok) {
        throw new Error(`読み込み失敗：${path}`);
    }

    return await response.json();
}

/**
 * スクリプト一覧を生成する
 * @param {Array} items 表示対象のスクリプト
 */
function renderScriptList(items) {
    const container = document.getElementById("script-list");

    container.replaceChildren();

    items.forEach(script => {
        const button = createElement("button", script.name, "script-button");

        button.classList.toggle("active", script.id === selectedId);
        button.addEventListener("click", () => showScript(script.id));

        container.appendChild(button);
    });
}

/**
 * スクリプトの詳細情報を表示する
 * @param {string} id スクリプトの識別ID
 */
function showScript(id) {
    const script = scripts.find(item => item.id === id);

    if (!script) return;

    selectedId = id;

    const content = document.getElementById("content");

    content.replaceChildren();

    // 基本情報
    content.append(
        createElement("p", script.namespace, "namespace"),
        createElement("h1", script.name),
        createElement("p", script.summary),
        createElement("h2", "依存関係")
    );

    // 依存関係
    const dependencies = document.createElement("ul");

    script.dependencies.forEach(name => {
        dependencies.appendChild(createElement("li", name));
    });

    content.append(
        dependencies,
        createElement("h2", "公開API")
    );

    // 公開API
    script.members.forEach(member => {
        const section = createElement("section", "", "api-item");

        section.append(
            createElement("code", member.signature),
            createElement("p", member.summary)
        );

        content.appendChild(section);
    });

    searchScripts();
}

/**
 * スクリプトを検索する
 */
function searchScripts() {
    const keyword = document.getElementById("search")
        .value.trim().toLowerCase();

    const results = scripts.filter(script =>
        JSON.stringify(script).toLowerCase().includes(keyword)
    );

    renderScriptList(results);
}

/**
 * テキスト付きHTML要素を生成する
 */
function createElement(tag, text, className = "") {
    const element = document.createElement(tag);

    element.textContent = text;
    element.className = className;

    return element;
}

document.getElementById("search")
    .addEventListener("input", searchScripts);

initialize();