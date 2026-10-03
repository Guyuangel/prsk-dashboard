// GitHub Contents API を使った最小限の読み書き
const API = "https://api.github.com";

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));

export class GitHubStore {
  constructor({ owner, repo, branch, token }) {
    Object.assign(this, { owner, repo, branch, token });
  }

  async request(path, init = {}) {
    const res = await fetch(`${API}/repos/${this.owner}/${this.repo}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const hint = { 401: "トークンが無効です", 403: "権限がありません", 404: "リポジトリまたはファイルが見つかりません（またはトークンに権限がありません）", 409: "競合しました。もう一度保存してください", 422: "競合しました。もう一度保存してください" }[res.status];
      throw new Error(`${hint || "GitHub API エラー"} (${res.status}${body.message ? `: ${body.message}` : ""})`);
    }
    return res.json();
  }

  async verify() {
    const repo = await this.request("");
    if (!repo.permissions?.push) throw new Error("このトークンにはリポジトリへの書き込み権限がありません");
    return repo;
  }

  async readJSON(path) {
    const file = await this.request(`/contents/${path}?ref=${encodeURIComponent(this.branch)}`, { cache: "no-store" });
    return { json: JSON.parse(fromBase64(file.content)), sha: file.sha };
  }

  async writeFile(path, text, sha, message) {
    return this.request(`/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({ message, content: toBase64(text), sha, branch: this.branch }),
    });
  }
}
