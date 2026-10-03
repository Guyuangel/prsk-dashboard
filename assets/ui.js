// 各チェックシートで共通に使う小さな DOM ヘルパー

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "value") node.value = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const pct = ({ done, total }) => (total ? Math.floor((done / total) * 1000) / 10 : 0).toFixed(1);

export function progressBar(s, small = false) {
  const bar = el("div", {
    class: `bar${small ? " bar-sm" : ""}`, role: "progressbar",
    "aria-valuemin": "0", "aria-valuemax": String(s.total), "aria-valuenow": String(s.done),
  }, el("span", { style: `width:${s.total ? (s.done / s.total) * 100 : 0}%` }));
  return bar;
}

// ラジオボタン風のセグメントコントロール
export function segmented(name, options, current, onChange) {
  const group = el("div", { class: "segmented", role: "radiogroup", "aria-label": name });
  const buttons = options.map(([value, text]) => el("button", {
    type: "button", role: "radio", "aria-checked": String(value === current),
    onclick: () => {
      buttons.forEach(b => b.setAttribute("aria-checked", String(b === buttons[options.findIndex(o => o[0] === value)])));
      onChange(value);
    },
  }, text));
  group.append(...buttons);
  return group;
}
