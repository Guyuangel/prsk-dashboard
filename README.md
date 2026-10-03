# チェックシート

ゲームの回収状況を公開するチェックシートです。「プロジェクトセカイ / マイセカイチェックリスト」のように階層で整理しています。GitHub Pages で動く静的サイトで、ビルド不要です。

- **閲覧**：誰でも可能（公開ページ）
- **編集**：リポジトリに書き込み権限を持つ人（所有者）だけ。ページ右上の「編集」から GitHub トークンで接続すると、チェックを付け外しして `data/progress.json` に直接コミットできます。

## 構成

```
index.html
assets/
  app.js                 コア（階層ルーティング・編集モード・保存）
  github.js              GitHub Contents API での読み書き
  ui.js                  共通 UI 部品
  style.css
  types/                 チェックシートの「種類」ごとの描画モジュール
    mysekai-conversations.js   マイセカイ会話（家具 × キャラ）
    simple.js                  汎用リスト（JSON だけで新しいチェックシートを作れる）
data/
  site.json              サイト設定と階層（tree）
  progress.json          進捗（チェック済みのキー一覧）
  prsk/                  プロジェクトセカイ用のデータ
    characters.json      ユニット・キャラ（ID・色）
    mysekai/conversations.json  マイセカイ会話データ
```

## ページの階層と URL

`data/site.json` の `tree` がそのままサイトの階層になります。

```
チェックシート（トップ）                 #/
└ プロジェクトセカイ（カテゴリ）          #/prsk
   └ マイセカイチェックリスト              #/prsk/mysekai
```

- `children` を持つノード = カテゴリ（中のページがカードで並ぶ）
- `type` と `data` を持つノード = チェックシート
- 階層はいくらでも深くできます（例 `#/prsk/mysekai/blueprints`）
- `characters` はカテゴリに書けば配下のページすべてに引き継がれます
- 同じカテゴリにページが 2 つ以上あると、ヘッダーにタブが出ます

## 公開手順（初回のみ）

1. GitHub に **public** リポジトリを作り、このフォルダを push する
2. リポジトリの Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にする
3. `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される

## 編集モードの使い方

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token
   - Repository access：**このリポジトリだけ**
   - Permissions：**Contents → Read and write**
2. 公開ページ右上の「編集」→ トークンを入力して「接続」
3. チップをタップしてチェック → 下のバーの「GitHub に保存」でコミット（反映まで 1〜2 分）

トークンはそのブラウザの localStorage にだけ保存されます。他人がページを開いても編集はできません（書き込みには所有者のトークンが必要なため）。
共用 PC では使い終わったら「トークンを削除」してください。

## データの追加・修正

### マイセカイ会話（`data/prsk/mysekai/conversations.json`）

家具 1 件 = 1 行です。

```json
{"id": "f0334", "name": "新しい家具", "note": "任意のメモ", "solo": ["ichika", "saki"], "groups": [["ichika", "saki"], ["honami", "ichika", "saki", "shiho"]]}
```

| フィールド | 意味 |
|---|---|
| `id` | 家具 ID。**一度決めたら変えない**（進捗のキーに使われるため）。新規は今ある最大の番号の次を振る |
| `name` | 家具名（自由に修正可） |
| `alternatives` | 「いずれかの家具で発生」する場合の家具名リスト（ソファ系など） |
| `note` | 補足（入手方法・注意など） |
| `solo` | 1人会話が発生するキャラ ID |
| `groups` | 2人以上の会話。メンバーの組み合わせごとに 1 要素 |

キャラ ID は `data/prsk/characters.json` を参照してください。家具の入手方法・カテゴリ・画像などの項目は、そのまま追加して OK です（画面は未対応の項目を無視します）。

進捗のキーは `家具ID:キャラID（昇順ソートして + で連結）` です（例 `f0293:ln_luka+ln_miku`）。

### 新しいページを追加する（例：プロジェクトセカイ / イベントカード）

1. データを置く（例 `data/prsk/cards/event-cards.json`）。汎用タイプの形式：

```json
{
  "source": "任意",
  "groups": [
    {"name": "グループ名", "items": [{"id": "card-001", "name": "表示名", "note": "任意", "chars": ["ichika"]}]}
  ]
}
```

2. `data/site.json` の `プロジェクトセカイ` の `children` に追加：

```json
{"id": "event-cards", "title": "イベントカード", "description": "説明", "type": "simple", "data": "data/prsk/cards/event-cards.json"}
```

→ `#/prsk/event-cards` で開けるようになり、プロジェクトセカイのページにカードが増えます。

別のゲームを足す場合は、`tree` 直下に `{"id": "...", "title": "...", "children": [...]}` を追加します。

専用の見た目が欲しい場合は `assets/types/<type>.js` を作り、`export function render(root, ctx)`（とカード表示用の `summarize`）を実装します（`mysekai-conversations.js` が例）。

**注意**：進捗はページのパス（例 `prsk/mysekai`）をキーに保存されます。ページの `id` や位置を変えるときは、`"progressKey": "prsk/mysekai"` を書いて元のキーを指定すれば進捗が引き継がれます。

## ローカルで確認

```
python -m http.server 8000
# → http://localhost:8000/
```

## クレジット

非公式のファンメイドツールです。ゲーム内の名称等の権利は各権利者に帰属します。
このツールは [Claude Code](https://claude.com/claude-code) を使って作成しています。
