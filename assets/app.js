// チェックシート — コア
// - data/site.json の tree（フォルダ／チェックシートの階層）を読み込み、type ごとの描画モジュールに渡す
// - 進捗は data/progress.json（誰でも閲覧可）。編集は GitHub トークンを持つ所有者のみ
import { GitHubStore } from "./github.js";
import { el, pct, progressBar } from "./ui.js";

const $ = (sel, root = document) => root.querySelector(sel);
const OWNER_KEY = "prsk:owner";
const DRAFT_KEY = "prsk:draft";

const state = {
  site: null,
  nodes: new Map(),        // path -> ノード情報
  leaves: [],              // チェックシート（末端ノード）
  progress: null,          // サーバ上の進捗 { updatedAt, checklists: { progressKey: [...keys] } }
  checked: new Map(),      // progressKey -> Set(keys)（下書き込みの現在値）
  canEdit: false,
  github: null,
  listeners: new Set(),
  dataCache: new Map(),
};

function storage(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key) || "null");
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { return null; }
}

async function fetchJSON(path, bust = false) {
  const res = await fetch(bust ? `${path}?t=${Date.now()}` : path, { cache: bust ? "no-store" : "default" });
  if (!res.ok) throw new Error(`${path} の読み込みに失敗しました (${res.status})`);
  return res.json();
}

// ---------- 進捗 ----------
function baseline(id) { return new Set(state.progress.checklists?.[id] || []); }

function loadChecked() {
  const draft = state.canEdit ? storage(DRAFT_KEY) || {} : {};
  state.checked.clear();
  for (const { progressKey: id } of state.leaves) {
    const set = baseline(id);
    const d = draft[id];
    if (d) { d.add?.forEach(k => set.add(k)); d.remove?.forEach(k => set.delete(k)); }
    state.checked.set(id, set);
  }
}

function diff() {
  const out = {};
  let n = 0;
  for (const [id, set] of state.checked) {
    const base = baseline(id);
    const add = [...set].filter(k => !base.has(k));
    const remove = [...base].filter(k => !set.has(k));
    if (add.length || remove.length) { out[id] = { add, remove }; n += add.length + remove.length; }
  }
  return { changes: out, count: n };
}

function persistDraft() {
  const { changes, count } = diff();
  storage(DRAFT_KEY, count ? changes : null);
  renderSaveBar(count);
}

function toggle(checklistId, key, value) {
  if (!state.canEdit) return false;
  const set = state.checked.get(checklistId);
  const next = value ?? !set.has(key);
  next ? set.add(key) : set.delete(key);
  persistDraft();
  state.listeners.forEach(fn => fn(checklistId, key, next));
  return next;
}

function serializeProgress(checklists) {
  const sorted = {};
  for (const id of Object.keys(checklists).sort()) sorted[id] = [...checklists[id]].sort();
  return JSON.stringify({ updatedAt: new Date().toISOString(), checklists: sorted }, null, 1) + "\n";
}

// ---------- UI: ヘッダ・保存バー・編集ダイアログ ----------
function renderSaveBar(count) {
  const bar = $("#savebar");
  bar.hidden = !state.canEdit;
  $("#savebar-text").textContent = count ? `未保存の変更 ${count} 件` : "編集モード：チェックを付け外しできます";
  $("#save-btn").disabled = !count;
  $("#discard-btn").disabled = !count;
  document.body.classList.toggle("has-savebar", state.canEdit);
}

function renderEditButton() {
  const btn = $("#edit-toggle");
  btn.textContent = state.canEdit ? "編集中" : "編集";
  btn.classList.toggle("is-active", state.canEdit);
}

function setupEditDialog() {
  const dialog = $("#edit-dialog");
  const form = $("#edit-form");
  const err = $("#edit-error");

  $("#edit-toggle").addEventListener("click", () => {
    const saved = storage(OWNER_KEY) || {};
    const gh = { ...guessRepo(), ...state.site.github, ...saved };
    form.owner.value = gh.owner || "";
    form.repo.value = gh.repo || "";
    form.branch.value = gh.branch || "main";
    form.token.value = saved.token || "";
    $("#logout-btn").hidden = !saved.token;
    err.hidden = true;
    dialog.showModal();
  });

  $("#download-btn").addEventListener("click", () => {
    const all = Object.fromEntries([...state.checked].map(([id, set]) => [id, set]));
    const blob = new Blob([serializeProgress(all)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "progress.json" });
    a.click();
    URL.revokeObjectURL(a.href);
  });

  form.addEventListener("submit", async (e) => {
    const action = e.submitter?.value;
    if (action === "cancel") return;
    if (action === "logout") {
      storage(OWNER_KEY, null);
      storage(DRAFT_KEY, null);
      state.canEdit = false;
      state.github = null;
      loadChecked();
      refresh();
      return;
    }
    e.preventDefault();
    const cfg = {
      owner: form.owner.value.trim(), repo: form.repo.value.trim(),
      branch: form.branch.value.trim(), token: form.token.value.trim(),
    };
    err.hidden = true;
    try {
      const gh = new GitHubStore(cfg);
      await gh.verify();
      storage(OWNER_KEY, cfg);
      await enableEdit(gh);
      dialog.close();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });

  $("#discard-btn").addEventListener("click", () => {
    if (!confirm("未保存の変更を破棄しますか？")) return;
    storage(DRAFT_KEY, null);
    loadChecked();
    refresh();
  });

  $("#save-btn").addEventListener("click", save);
}

function guessRepo() {
  // https://<owner>.github.io/<repo>/ から推測
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (!m) return {};
  const repo = location.pathname.split("/").filter(Boolean)[0] || `${m[1]}.github.io`;
  return { owner: m[1], repo };
}

async function enableEdit(gh) {
  state.github = gh;
  state.canEdit = true;
  loadChecked();
  refresh();
}

async function save() {
  const btn = $("#save-btn");
  const { changes, count } = diff();
  if (!count) return;
  btn.disabled = true;
  btn.textContent = "保存中…";
  try {
    const path = state.site.github.progressPath;
    // 最新の progress.json に差分を当てて保存（別端末での更新を消さないため）
    const { json: remote, sha } = await state.github.readJSON(path);
    const lists = {};
    for (const [id, arr] of Object.entries(remote.checklists || {})) lists[id] = new Set(arr);
    for (const [id, { add, remove }] of Object.entries(changes)) {
      const set = lists[id] ||= new Set();
      add.forEach(k => set.add(k));
      remove.forEach(k => set.delete(k));
    }
    const text = serializeProgress(lists);
    const added = Object.values(changes).reduce((a, c) => a + c.add.length, 0);
    await state.github.writeFile(path, text, sha, `進捗を更新（+${added} / -${count - added}）`);
    state.progress = JSON.parse(text);
    storage(DRAFT_KEY, null);
    loadChecked();
    refresh();
    toast("保存しました。公開ページへの反映には 1〜2 分かかります。");
  } catch (ex) {
    alert(`保存に失敗しました：${ex.message}`);
  } finally {
    btn.textContent = "GitHub に保存";
    renderSaveBar(diff().count);
  }
}

function toast(msg) {
  const el = Object.assign(document.createElement("div"), { className: "toast", textContent: msg });
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------- ツリー（data/site.json の tree） ----------
// ノードは「フォルダ（children を持つ）」か「チェックシート（type と data を持つ）」。
// URL は #/プロジェクトセカイのID/ページのID のように id を / でつないだもの。
function indexTree(nodes, parent = null, inherited = {}) {
  for (const node of nodes) {
    const path = parent ? `${parent.path}/${node.id}` : node.id;
    const info = {
      node, path, parent,
      chain: parent ? [...parent.chain, node] : [node],
      characters: node.characters || inherited.characters,
      progressKey: node.progressKey || path,   // 進捗の保存キー（ページを移動しても進捗を保ちたい時は明示）
    };
    state.nodes.set(path, info);
    if (node.children) indexTree(node.children, info, { characters: info.characters });
    else state.leaves.push(info);
  }
}

const childrenOf = (info) => (info ? info.node.children : state.site.tree)
  .map(n => state.nodes.get(info ? `${info.path}/${n.id}` : n.id));

async function loadLeaf(info) {
  if (!state.dataCache.has(info.path)) state.dataCache.set(info.path, await fetchJSON(info.node.data));
  if (info.characters && !state.dataCache.has(info.characters)) {
    state.dataCache.set(info.characters, await fetchJSON(info.characters));
  }
  return {
    data: state.dataCache.get(info.path),
    characters: info.characters ? state.dataCache.get(info.characters) : { units: [], characters: [] },
    mod: await import(`./types/${info.node.type}.js`),
  };
}

function link(info) { return info ? `#/${info.path}` : "#/"; }

function renderNav(info) {
  // パンくず：チェックシート › プロジェクトセカイ › マイセカイチェックリスト
  const crumbs = [null, ...(info ? info.chain.map((_, i) => state.nodes.get(info.chain.slice(0, i + 1).map(n => n.id).join("/"))) : [])];
  $("#crumbs").replaceChildren(...crumbs.flatMap((c, i) => {
    const label = c ? c.node.title : state.site.title;
    const last = i === crumbs.length - 1;
    const a = el(last ? "span" : "a", { href: last ? null : link(c), "aria-current": last ? "page" : null }, label);
    return i ? [el("span", { class: "sep", "aria-hidden": "true" }, "›"), a] : [a];
  }));
  // タブ：同じ階層のページ
  const siblings = info ? childrenOf(info.parent) : [];
  $("#tabs").hidden = siblings.length < 2;
  $("#tabs").replaceChildren(...siblings.map(s =>
    el("a", { href: link(s), "aria-current": s === info ? "page" : null }, s.node.title)));
  syncHeaderHeight();
}

// 絞り込みバーをヘッダー直下に固定するため、ヘッダーの高さを CSS 変数に渡す
function syncHeaderHeight() {
  document.documentElement.style.setProperty("--header-h", `${$(".site-header").offsetHeight}px`);
}

function renderFolder(view, info) {
  const title = info ? info.node.title : state.site.title;
  const desc = info ? info.node.description : state.site.description;
  const cards = childrenOf(info).map(child => {
    const meta = el("p", { class: "muted small" });
    const bar = el("div");
    if (child.node.children) {
      const n = state.leaves.filter(l => l.path.startsWith(`${child.path}/`)).length;
      meta.textContent = `${n} 件のチェックシート`;
    } else {
      // 進捗を非同期で表示（各タイプの summarize を利用）
      loadLeaf(child).then(({ data, characters, mod }) => {
        if (!mod.summarize) return;
        const s = mod.summarize(data, { characters, isChecked: k => state.checked.get(child.progressKey).has(k) });
        meta.textContent = `${s.done.toLocaleString()} / ${s.total.toLocaleString()}（${pct(s)}%）`;
        bar.replaceWith(progressBar(s));
      }).catch(() => {});
    }
    return el("a", { class: "node-card", href: link(child) },
      el("span", { class: "node-kind" }, child.node.children ? "カテゴリ" : "チェックシート"),
      el("h2", {}, child.node.title),
      child.node.description && el("p", { class: "muted small" }, child.node.description),
      meta, bar);
  });
  view.replaceChildren(
    el("div", { class: "page-head" }, el("h1", {}, title), desc && el("p", { class: "muted" }, desc)),
    el("div", { class: "node-grid" }, ...cards));
}

function renderFooter() {
  const updated = state.progress.updatedAt
    ? new Date(state.progress.updatedAt).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })
    : "—";
  const sources = new Set(state.leaves.map(l => state.dataCache.get(l.path)?.source).filter(Boolean));
  $("#footer").replaceChildren(
    el("p", {}, `進捗の最終更新：${updated}`),
    ...[...sources].map(s => el("p", {}, `データ元：${s}`)),
    el("p", {}, "非公式のファンメイドツールです。ゲーム内の名称等の権利は各権利者に帰属します。"),
    el("p", {}, "このツールは Claude Code を使って作成しています。"));
}

async function route() {
  const path = decodeURIComponent(location.hash.replace(/^#\/?/, "").split("?")[0]).replace(/\/+$/, "");
  const info = path ? state.nodes.get(path) : null;
  const view = $("#view");
  state.listeners.clear();
  renderNav(info);
  window.scrollTo(0, 0);
  try {
    if (path && !info) {
      view.replaceChildren(el("p", { class: "error" }, "ページが見つかりません。"), el("a", { href: "#/" }, "トップへ"));
    } else if (!info || info.node.children) {
      document.title = info ? `${info.node.title} | ${state.site.title}` : state.site.title;
      renderFolder(view, info);
    } else {
      document.title = `${info.node.title} | ${info.chain[0].title}`;
      const { data, characters, mod } = await loadLeaf(info);
      const key = info.progressKey;
      view.replaceChildren();
      mod.render(view, {
        checklist: info.node,
        path: info.path,
        data,
        characters,
        canEdit: state.canEdit,
        isChecked: k => state.checked.get(key).has(k),
        toggle: (k, value) => toggle(key, k, value),
        onChange: fn => state.listeners.add((cid, k, v) => cid === key && fn(k, v)),
        // 絞り込み条件などを URL（#/prsk/mysekai?char=...）に保持。共有リンクにもなる
        params: new URLSearchParams(location.hash.split("?")[1] || ""),
        setParams: (params) => {
          const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
          history.replaceState(null, "", `#/${info.path}${q ? `?${q}` : ""}`);
        },
      });
    }
  } catch (ex) {
    view.replaceChildren(el("p", { class: "error" }, ex.message));
    console.error(ex);
  }
  renderFooter();
}

function refresh() {
  renderEditButton();
  renderSaveBar(diff().count);
  route();
}

// ---------- 起動 ----------
async function main() {
  [state.site, state.progress] = await Promise.all([
    fetchJSON("data/site.json"),
    fetchJSON("data/progress.json", true),
  ]);
  indexTree(state.site.tree);
  $("#site-title").textContent = state.site.title;
  setupEditDialog();

  const saved = storage(OWNER_KEY);
  if (saved?.token) {
    state.github = new GitHubStore(saved);
    state.canEdit = true;   // 保存時に権限エラーなら分かるので、起動時の検証は省略
  }
  loadChecked();
  window.addEventListener("hashchange", route);
  window.addEventListener("resize", syncHeaderHeight);
  refresh();
}

main().catch(ex => {
  $("#view").innerHTML = "";
  $("#view").append(Object.assign(document.createElement("p"), { className: "error", textContent: ex.message }));
});
