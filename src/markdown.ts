import MarkdownIt from "markdown-it";
import markdownItFootnote from "markdown-it-footnote";
import markdownItTaskLists from "markdown-it-task-lists";
import type { DocRecord } from "./db";

// html: false に固定。本文から生 HTML がプレビューへ入らないことを
// 唯一の XSS 対策として設計上保証する。
// GFM のタスクリスト・脚注は markdown-it にはプラグインとして追加が必要。
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  // タスクリストはプレビュー専用 (enabled: [] でクリックでの切替を無効化)
}).use(markdownItFootnote).use(markdownItTaskLists, {
  label: true,
  labelAfterItem: true,
  enabled: [],
});

// 見出し自動番号付け (Word エクスポートと同じ書式)
// H2 → 1.  H3 → (1)  H4 → ①  H5 → イ
const CIRCLED = "\u2460\u2461\u2462\u2463\u2464\u2465\u2466\u2467\u2468\u2469\u246a\u246b\u246c\u246d\u246e\u246f\u2470\u2471\u2472\u2473";
const IROHA = "イロハニホヘトチリヌルヲワカヨタレソツネナラムイヅヨエオ"

export function headingNumber(level: number, counters: number[]): string {
  if (level < 2 || level > 5) return "";
  const idx = level - 2;

  counters[idx] += 1;
  const n = counters[idx];

  // 上位見出しが現れたら下位をリセット
  for (let i = idx + 1; i < counters.length; i++) {
    counters[i] = 0;
  }

  switch (level) {
    case 2: return `${n}. `;
    case 3: return `(${n}) `;
    case 4: return (n >= 1 && n <= 20 ? CIRCLED[n - 1] : String(n)) + " ";
    case 5: return (n >= 1 && n <= 46 ? IROHA[n - 1] : String(n)) + " ";
    default: return "";
  }
}

export function renderMarkdown(body: string): string {
  let html = md.render(body);
  const counters: number[] = [0, 0, 0, 0]; // h2〜h5

  // 各見出しに番号 span を注入
  html = html.replace(/<h([2-5])(\s[^>]*)?>/g, (match, levelStr, _attrs) => {
    const level = Number(levelStr);
    const num = headingNumber(level, counters);
    return match + `<span class="heading-num">${num}</span>`;
  });

  return html;
}

export interface OutlineItem {
  level: number;
  text: string;
  /** 0 始まりの行番号 */
  line: number;
}

function rawLineAt(body: string, line: number): string {
  return body.split("\n")[line] ?? "";
}

function headingText(raw: string): string {
  return raw.replace(/^ {0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, "").trim();
}

export function extractOutline(body: string): OutlineItem[] {
  const tokens = md.parse(body, {});
  const items: OutlineItem[] = [];
  for (const tok of tokens) {
    if (tok.type === "heading_open" && tok.map) {
      items.push({
        level: Number(tok.tag.slice(1)),
        text: headingText(rawLineAt(body, tok.map[0])),
        line: tok.map[0],
      });
    }
  }
  return items;
}

/** 先頭の H1 を文書名として返す。なければ null */
export function extractTitle(body: string): string | null {
  const tokens = md.parse(body, {});
  for (const tok of tokens) {
    if (tok.type === "heading_open" && tok.tag === "h1" && tok.map) {
      const text = headingText(rawLineAt(body, tok.map[0]));
      if (text) return text;
    }
  }
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** 文書の識別名: 先頭 H1 > インポート時のファイル名 > 初回保存タイムスタンプ */
export function docDisplayName(doc: DocRecord): string {
  return (
    extractTitle(doc.body) ??
    doc.importedName ??
    formatDateTime(doc.firstSavedAt)
  );
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 150);
  return cleaned || "untitled";
}
