// 汎用チェックリスト（新しいチェックシートを JSON だけで追加するためのタイプ）
// データ例:
// {
//   "source": "任意",
//   "groups": [
//     { "name": "グループ名", "items": [ { "id": "一意なID", "name": "表示名", "note": "任意", "chars": ["ichika"] } ] }
//   ]
// }
// 進捗には item.id が保存されるので、id は後から変えないでください。
import { el, progressBar, segmented, pct } from "../ui.js";

export function summarize(data, { isChecked }) {
  const items = data.groups.flatMap(g => g.items);
  return { done: items.filter(i => isChecked(i.id)).length, total: items.length };
}

export function render(root, ctx) {
  const { data, checklist, characters } = ctx;
  const chars = new Map(characters.characters.map(c => [c.id, c]));
  const items = data.groups.flatMap(g => g.items);
  const filter = { status: ["todo", "done"].includes(ctx.params.get("status")) ? ctx.params.get("status") : "all" };
  const stats = (list) => ({ done: list.filter(i => ctx.isChecked(i.id)).length, total: list.length });

  const summary = el("section", { class: "card summary" });
  const list = el("div", { class: "furniture-list" });
  root.append(
    el("div", { class: "page-head" }, el("h1", {}, checklist.title),
      checklist.description && el("p", { class: "muted" }, checklist.description)),
    summary,
    el("div", { class: "toolbar" },
      segmented("状態", [["all", "すべて"], ["todo", "未回収"], ["done", "回収済"]], filter.status,
        v => { filter.status = v; ctx.setParams({ status: v !== "all" && v }); renderList(); })),
    list,
  );

  function renderSummary() {
    const s = stats(items);
    summary.replaceChildren(
      el("div", { class: "summary-main" },
        el("div", { class: "big" }, pct(s), el("span", { class: "unit" }, "%")),
        el("div", { class: "summary-text" }, el("strong", {}, `${s.done} / ${s.total}`))),
      progressBar(s));
  }

  function renderList() {
    list.replaceChildren(...data.groups.map(g => {
      const shown = g.items.filter(i => filter.status === "all" || (filter.status === "done") === ctx.isChecked(i.id));
      if (!shown.length) return null;
      const s = stats(g.items);
      return el("article", { class: "fcard" },
        el("div", { class: "fcard-head" }, el("h3", {}, g.name),
          el("span", { class: `fcard-count${s.done === s.total ? " is-complete" : ""}` }, `${s.done}/${s.total}`)),
        el("div", { class: "chips" }, ...shown.map(i => {
          const done = ctx.isChecked(i.id);
          const color = chars.get(i.chars?.[0])?.color || "var(--accent)";
          return el(ctx.canEdit ? "button" : "span", {
            class: `chip${done ? " is-done" : ""}`, "data-key": i.id, style: `--c:${color}`,
            title: i.note || "",
            ...(ctx.canEdit ? { type: "button", "aria-pressed": String(done), onclick: () => ctx.toggle(i.id) } : {}),
          }, el("span", { class: "check", "aria-hidden": "true" }), el("span", {}, i.name));
        })));
    }).filter(Boolean));
  }

  ctx.onChange(() => { renderSummary(); renderList(); });
  renderSummary();
  renderList();
}
