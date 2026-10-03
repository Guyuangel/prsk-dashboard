// マイセカイ会話チェックシート
// データ: data/mysekai/conversations.json
//   furniture[]: { id, name, alternatives?, note?, solo?: [charId], groups?: [[charId, ...]] }
// 会話キー: "<家具ID>:<キャラID を昇順ソートして + で連結>"（progress.json に保存される値）
import { el, progressBar, segmented, pct } from "../ui.js";

export function conversationKey(furnitureId, members) {
  return `${furnitureId}:${[...members].sort().join("+")}`;
}

// トップ／カテゴリページのカードに表示する集計
export function summarize(data, { isChecked }) {
  let done = 0, total = 0;
  for (const f of data.furniture) {
    for (const members of [...(f.solo || []).map(id => [id]), ...(f.groups || [])]) {
      total++;
      if (isChecked(conversationKey(f.id, members))) done++;
    }
  }
  return { done, total };
}

export function render(root, ctx) {
  const { data, characters, checklist } = ctx;
  const opts = { expPerConversations: 10, expCap: 400, ...checklist.options };
  const chars = new Map(characters.characters.map((c, i) => [c.id, { ...c, order: i }]));
  const units = characters.units;
  const label = (id) => chars.get(id)?.label || chars.get(id)?.short || id;
  const byOrder = (a, b) => (chars.get(a)?.order ?? 999) - (chars.get(b)?.order ?? 999);

  // ---- 正規化 ----
  const furniture = data.furniture.map(f => {
    const convs = [
      ...(f.solo || []).map(id => [id]),
      ...(f.groups || []).map(g => [...g].sort(byOrder)),
    ].map(members => ({ key: conversationKey(f.id, members), members, group: members.length > 1, f }));
    const haystack = [f.name, ...(f.alternatives || []), f.note || ""].join(" ").toLowerCase();
    return { ...f, convs, haystack };
  });
  const all = furniture.flatMap(f => f.convs);

  // ---- 絞り込み状態（URL に保持） ----
  const p = ctx.params;
  const filter = {
    char: chars.has(p.get("char")) ? p.get("char") : "",
    kind: ["solo", "group"].includes(p.get("kind")) ? p.get("kind") : "all",
    status: ["todo", "done"].includes(p.get("status")) ? p.get("status") : "all",
    q: p.get("q") || "",
  };
  const syncParams = () => ctx.setParams({
    char: filter.char, kind: filter.kind !== "all" && filter.kind,
    status: filter.status !== "all" && filter.status, q: filter.q,
  });

  // ---- 集計 ----
  function stats(list) {
    let done = 0;
    for (const c of list) if (ctx.isChecked(c.key)) done++;
    return { done, total: list.length };
  }
  const convsOf = (pred) => all.filter(c => c.members.some(pred));
  const expLeft = ({ done, total }) => {
    const cap = (n) => Math.min(n, opts.expCap);
    return Math.floor(cap(total) / opts.expPerConversations) - Math.floor(cap(done) / opts.expPerConversations);
  };

  // ---- レイアウト ----
  const summary = el("section", { class: "card summary" });
  const charGrid = el("section", { class: "char-grid", "aria-label": "キャラクター別の回収状況" });
  const detail = el("section", { class: "card detail" });
  const toolbar = el("div", { class: "toolbar" });
  const list = el("div", { class: "furniture-list" });
  const empty = el("p", { class: "empty muted" }, "条件に合う会話はありません。");

  root.append(
    el("div", { class: "page-head" },
      el("h1", {}, checklist.title),
      checklist.description && el("p", { class: "muted" }, checklist.description)),
    summary, charGrid, detail, toolbar, list, empty,
  );

  // サマリー
  function renderSummary() {
    const s = stats(all);
    const solo = stats(all.filter(c => !c.group));
    const grp = stats(all.filter(c => c.group));
    summary.replaceChildren(
      el("div", { class: "summary-main" },
        el("div", { class: "big" }, pct(s), el("span", { class: "unit" }, "%")),
        el("div", { class: "summary-text" },
          el("strong", {}, `${s.done.toLocaleString()} / ${s.total.toLocaleString()} 会話`),
          el("span", { class: "muted" }, `1人 ${solo.done}/${solo.total}　·　2人以上 ${grp.done}/${grp.total}`))),
      progressBar(s),
    );
  }

  // キャラ一覧
  function renderChars() {
    charGrid.replaceChildren(...units.map(u => {
      const members = characters.characters.filter(c => c.unit === u.id);
      return el("div", { class: "unit-block", style: `--unit:${u.color}` },
        el("h2", { class: "unit-name" }, u.short),
        el("div", { class: "unit-chars" }, ...members.map(c => {
          const s = stats(convsOf(id => id === c.id));
          return el("button", {
            type: "button", class: "char-btn", style: `--c:${c.color}`,
            "aria-pressed": String(filter.char === c.id),
            title: `${c.name}（${u.short}）`,
            onclick: () => { filter.char = filter.char === c.id ? "" : c.id; update(); },
          },
          el("span", { class: "char-label" }, el("i", { class: "dot" }), label(c.id)),
          el("span", { class: "char-count" }, `${s.done}/${s.total}`),
          progressBar(s, true));
        })));
    }));
  }

  // 選択キャラの詳細
  function renderDetail() {
    detail.hidden = !filter.char;
    if (!filter.char) return;
    const c = chars.get(filter.char);
    const unit = units.find(u => u.id === c.unit);
    const mine = convsOf(id => id === c.id);
    const solo = stats(mine.filter(x => !x.group));
    const grp = stats(mine.filter(x => x.group));
    // キャラランクはキャラ単位（ミクなどはユニットをまたいで合算）
    const base = c.base || c.id;
    const sameBase = characters.characters.filter(x => (x.base || x.id) === base);
    const rank = stats(convsOf(id => sameBase.some(x => x.id === id)));
    detail.style.setProperty("--c", c.color);
    detail.replaceChildren(
      el("div", { class: "detail-head" },
        el("i", { class: "dot lg" }),
        el("div", {},
          el("h2", {}, `${c.name}`, el("small", { class: "muted" }, `　${unit.short}${c.label ? ` · ${c.label}` : ""}`)),
          el("p", { class: "muted small" }, `1人 ${solo.done}/${solo.total}　·　2人以上 ${grp.done}/${grp.total}`)),
        el("button", { type: "button", class: "btn btn-ghost", onclick: () => { filter.char = ""; update(); } }, "選択解除")),
      el("p", { class: "small" },
        `キャラランクEXP 獲得見込み残り：`, el("strong", {}, `${expLeft(rank)}`),
        sameBase.length > 1 ? el("span", { class: "muted" }, `（全ユニットの${c.short}合算 ${rank.done}/${rank.total}）`) : null),
      el("p", { class: "muted small" }, `※ ${opts.expPerConversations}会話ごとに1回、${opts.expCap}種類までとして計算しています。`),
    );
  }

  // ツールバー
  const search = el("input", {
    type: "search", class: "search", placeholder: "家具名で検索", value: filter.q, "aria-label": "家具名で検索",
    oninput: (e) => { filter.q = e.target.value; update(false); },
  });
  const resultCount = el("span", { class: "muted small result-count" });
  toolbar.append(
    segmented("種別", [["all", "すべて"], ["solo", "1人"], ["group", "2人以上"]], filter.kind, v => { filter.kind = v; update(false); }),
    segmented("状態", [["all", "すべて"], ["todo", "未回収"], ["done", "回収済"]], filter.status, v => { filter.status = v; update(false); }),
    search, resultCount,
  );

  // 家具リスト
  function visibleConvs(f) {
    return f.convs.filter(c =>
      (!filter.char || c.members.includes(filter.char)) &&
      (filter.kind === "all" || (filter.kind === "group") === c.group) &&
      (filter.status === "all" || (filter.status === "done") === ctx.isChecked(c.key)));
  }

  function chip(c) {
    const done = ctx.isChecked(c.key);
    const tag = ctx.canEdit ? "button" : "span";
    const node = el(tag, {
      class: `chip${done ? " is-done" : ""}${c.group ? " is-group" : ""}`,
      "data-key": c.key,
      style: `--c:${chars.get(c.members[0])?.color || "#999"}`,
      title: `${c.members.map(label).join("・")}：${done ? "回収済" : "未回収"}`,
      ...(ctx.canEdit ? { type: "button", "aria-pressed": String(done), onclick: () => ctx.toggle(c.key) } : {}),
    },
    el("span", { class: "check", "aria-hidden": "true" }),
    ...c.members.map(id => el("i", { class: "dot", style: `--c:${chars.get(id)?.color || "#999"}` })),
    el("span", {}, c.members.map(label).join("・")));
    return node;
  }

  function renderList() {
    const q = filter.q.trim().toLowerCase();
    let shownConvs = 0;
    const cards = [];
    for (const f of furniture) {
      if (q && !f.haystack.includes(q)) continue;
      const convs = visibleConvs(f);
      if (!convs.length) continue;
      shownConvs += convs.length;
      const s = stats(f.convs.filter(c => !filter.char || c.members.includes(filter.char)));
      const head = el("div", { class: "fcard-head" },
        el("h3", {}, f.alternatives ? `${f.alternatives[0]} ほか` : f.name),
        el("span", { class: `fcard-count${s.done === s.total ? " is-complete" : ""}` }, `${s.done}/${s.total}`));
      if (ctx.canEdit) {
        head.append(el("button", {
          type: "button", class: "btn btn-ghost btn-xs",
          onclick: () => {
            const allDone = convs.every(c => ctx.isChecked(c.key));
            convs.forEach(c => ctx.toggle(c.key, !allDone));
          },
        }, "表示中を一括"));
      }
      const meta = [];
      if (f.alternatives) meta.push(el("p", { class: "fcard-meta" }, `いずれかで発生：${f.alternatives.join(" / ")}`));
      if (f.note) meta.push(el("p", { class: "fcard-meta" }, f.note));
      cards.push(el("article", { class: "fcard", "data-fid": f.id }, head, ...meta,
        el("div", { class: "chips" }, ...convs.map(chip))));
    }
    list.replaceChildren(...cards);
    empty.hidden = cards.length > 0;
    resultCount.textContent = `${cards.length} 家具 / ${shownConvs} 会話`;
  }

  function update(full = true) {
    syncParams();
    if (full) { renderChars(); renderDetail(); }
    renderList();
  }

  // チェック変更時はチップだけ差し替え、集計を更新
  ctx.onChange((key, value) => {
    root.querySelectorAll(`.chip[data-key="${CSS.escape(key)}"]`).forEach(n => {
      n.classList.toggle("is-done", value);
      n.setAttribute("aria-pressed", String(value));
    });
    scheduleStats();
  });
  let pending = 0;
  function scheduleStats() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      renderSummary(); renderChars(); renderDetail();
      root.querySelectorAll(".fcard").forEach(card => {
        const f = furniture.find(x => x.id === card.dataset.fid);
        const s = stats(f.convs.filter(c => !filter.char || c.members.includes(filter.char)));
        const cnt = card.querySelector(".fcard-count");
        cnt.textContent = `${s.done}/${s.total}`;
        cnt.classList.toggle("is-complete", s.done === s.total);
      });
    });
  }

  renderSummary();
  update();
}
