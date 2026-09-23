# Markdown Editor

ローカルブラウザで動く GFM (GitHub Flavored Markdown) オンラインエディタ。
データは IndexedDB にのみ保存され、サーバは不要。

## 機能

- **リアルタイムプレビュー** — GFM (表・タスクリスト・脚注・ストライクスルー・linkify) を `markdown-it` + `markdown-it-footnote` / `markdown-it-task-lists` (`html: false` 固定) で即時描画
- **初回起動時に文書が 0 件なら最初の文書を自動作成** (文書なしで入力すると自動保存・コミットが対象なしになるのを防ぐ)
- **自動保存** — 入力後 500ms で IndexedDB に保存。文書ページを隠した時点でも即保存
- **コミット** — 任意のタイミングでメッセージ付きのスナップショット記録 (タイムスタンプ自動)
- **コミット間 diff** — Unified Diff をポップアップで表示 (行の +/- 色分け)。1 行の `diff` ボタンは直前コミットとの差分、チェック 2 件で任意の 2 コミットを比較
- **複数文書** — 識別名は先頭 H1 > (インポート時のファイル名) > 初回自動保存のタイムスタンプ
- **エクスポート** — `.md` / `.docx` / バックアップ `.json` (文書 + コミット履歴)
- **インポート** — `.md` / `.markdown` / `.txt` (UTF-8 → SHIFT-JIS フォールバック、上限 10MB、ドラッグ&ドロップ可) / バックアップ `.json`
- **レイアウト** — 左: 文書管理 + コミット履歴 / 中央: 入力・プレビュー (分割位置ドラッグ可、編集/分割/プレビューのセグメント切替) / 右: アウトライン / 右上: 使い方ガイド。左右サイドバーは独立して表示切替 (Alt+1 / Alt+2、状態は永続化、900px 未満ではオーバーレイ化)
- **UI** — ビジネス向け高コントラスト（Minimal High-Contrast）仕様: スレート＆ディープシアン基調のクリーンな配色（本文コントラスト比 21:1、境界線 4.76:1、WCAG 2.1 AA 適合）。選択中文書の左アクセントバー強調、Outlinedボタンスタイル、Material Symbols Outlined 自己ホスト、`prefers-color-scheme` による自動ダークモード対応。依存ライブラリなしの自前 CSS 実装
- **操作ガイド** — トップバー右上の「使い方」ボタンから、スクリーンショット付きの操作マニュアル（`guide.html`）をダイアログ内または別タブで即座に参照可能

## 開発・デプロイ

```sh
NODE_ENV=development npm install
npm run dev        # http://localhost:5173
npm run build      # 型チェック + 生産ビルド (dist/)
npm run preview    # 生産ビルドの配信
```

注意: この環境では `NODE_ENV=production` が既定で効いており devDependencies がスキップされるため、`npm install` 時は `NODE_ENV=development` を付けます。

### Cloudflare Pages / Workers へのデプロイ

リポジトリ直下に `wrangler.jsonc`（Static Assets 設定）を含んでいるため、Cloudflare Pages / Workers にそのままデプロイ可能です。

- **ビルドコマンド**: `npm run build`
- **ビルド出力ディレクトリ**: `dist`
- **デプロイコマンド**: `npx wrangler deploy` (または Pages 連携による自動デプロイ)

## 設計メモ

- **非セキュアコンテキスト対応**: `http://<LAN IP>` 開時は `crypto.randomUUID` が存在しない。`newId()` (起動時にネイティブの有無を判定し自己再帰しない) + 起動時一回の `crypto.randomUUID` グローバルポリフィルで、依存パッケージ (例: `@m2d/list`) の直接呼び出しもカバー。

- **セキュリティ**: プレビューに生 HTML を流さないため `markdown-it` を `html: false` 固定。インポートするテキストやコミット本文から XSS が成立しないことをこれだけで保証する。`html: true` への切替オプションは作らないこと。
- **保存**: 文書 (`documents`) とコミット (`commits`) を IndexedDB の 2 ストアに格納。コミットは全文スナップショット方式。
- **docx 出力**: `mdast2docx` (unified/remark 系) を使用し、テーブル (`@m2d/table`) と番号付きリスト (`@m2d/list`) をプラグインで有効化。重いため動的 import して初回ロードに含めない。**画像は docx に含まれない** (ローカル画像パスで変換が失敗しないための意図的な設計)。
- **バンドル**: 初期チャンクは markdown-it + idb + diff のみ (gzip ~60KB)。docx 系は初回エクスポート時のみ読込。

## 既知の制約

- データはブラウザ / プロファイル内に留まる (端末移行はバックアップ JSON で)
- H1 がない文書同士は表示名がタイムスタンプになるため区別しにくい (内部 ID による管理は正しく動く)
- コミット履歴が非常に大きい文書の diff は数秒かかる場合がある
