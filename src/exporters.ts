import type { CommitRecord, DocRecord } from "./db";
import { downloadBlob } from "./ui";
import { formatDateTime, sanitizeFileName } from "./markdown";
import { AlignmentType, LevelFormat, LevelSuffix, ShadingType } from "docx";
import type { IPlugin } from "@m2d/core";

// ---- Word 出力の書式（プレビューと揃える） ----

// プレビュー light テーマの変数値
const CODE_BG = "f4f4f5"; // --preview-code-bg
const QUOTE_TEXT_COLOR = "334155"; // --md-on-surface-variant
const CODE_FONT = { ascii: "Consolas", hAnsi: "Consolas", eastAsia: "Consolas", cs: "Consolas" };
const HEADING_NUM_REF = "heading-numbers";

// 見出し H2〜H5 の自動番号付け:
//   H2 → 1. 2. 3.
//   H3 → (1) (2) (3)
//   H4 → ① ② ③
//   H5 → イ ロ ハ
// 各レベルは上位見出しの直後に Word 側で自動的に 1 からリセットされる。
const headingNumbering: IPlugin = {
  preprocess: (tree) => {
    const walk = (node: any) => {
      if (node.type === "heading" && node.depth >= 2 && node.depth <= 5) {
        node.data = node.data || {};
        node.data.numbering = { reference: HEADING_NUM_REF, level: node.depth - 2 };
      }
      // コードブロック: ライブラリ既定の枠線をプレビュー (背景のみ) に合わせる
      if (node.type === "code") node.data = { ...(node.data || {}), border: undefined };
      // 引用: プレビューのテキスト色
      if (node.type === "blockquote") node.data = { ...(node.data || {}), color: QUOTE_TEXT_COLOR };
      node.children?.forEach(walk);
    };
    walk(tree);
  },
  block: (_t, _node, data) => {
    // listPlugin は ordered/unordered 両方に bullet と numbering を同時に設定する。
    // docx.js は両方の w:numPr を出力し Word は先頭 (bullet) を採用するため、
    // 番号付きリストが箇条書きとして描画されてしまう。不要な方を削除する。
    const d = data as typeof data & { tag?: string };
    if (d?.tag === "ol" && d?.bullet) delete d.bullet;
    if (d?.tag === "ul" && d?.numbering) delete d.numbering;
    return [];
  },
  root: (props) => {
    props.numbering = {
      config: [
        ...(props.numbering?.config ?? []),
        {
          reference: HEADING_NUM_REF,
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, suffix: LevelSuffix.SPACE },
            { level: 1, format: LevelFormat.DECIMAL, text: "(%1)", alignment: AlignmentType.START, suffix: LevelSuffix.SPACE },
            { level: 2, format: LevelFormat.DECIMAL_ENCLOSED_CIRCLE, text: "%1", alignment: AlignmentType.START, suffix: LevelSuffix.SPACE },
            { level: 3, format: LevelFormat.IROHA_FULL_WIDTH, text: "%1", alignment: AlignmentType.START, suffix: LevelSuffix.SPACE },
          ],
        },
      ],
    };
  },
};

// docxProps の styles はライブラリ既定と浅いマージ (上書き) されるため、
// ここに完全なスタイル定義を書く。
const docxProps = {
  styles: {
    default: {
      document: {
        paragraph: {
          spacing: { before: 0, line: 240 }, // 段落前 0 / 行間 1.0
          alignment: AlignmentType.JUSTIFIED, // 両端揃え
          keepLines: false, // 改ページ時1行残して段落を区切らない: OFF
        },
        run: { size: 22, font: { ascii: "MS Gothic", eastAsia: "MS Gothic" } }, // 標準 11pt / MSゴシック
      },
      heading1: {
        paragraph: { spacing: { before: 350 }, alignment: AlignmentType.CENTER },
        run: { size: 24, bold: true }, // 見出し1: 12pt 中央揃え
      },
      heading2: {
        paragraph: { spacing: { before: 350, line: 360 }, alignment: AlignmentType.JUSTIFIED },
        run: { size: 24, bold: true }, // 見出し2: 12pt / 行間 1.5
      },
      heading3: {
        paragraph: { spacing: { before: 350, line: 300 }, alignment: AlignmentType.JUSTIFIED },
        run: { size: 22, bold: true }, // 見出し3: 11pt / 行間 1.25
      },
      heading4: {
        paragraph: { spacing: { before: 350, line: 240 }, alignment: AlignmentType.JUSTIFIED },
        run: { size: 22, bold: true }, // 見出し4: 11pt / 行間 1.0
      },
      heading5: {
        paragraph: { spacing: { before: 350, line: 240 }, alignment: AlignmentType.JUSTIFIED },
        run: { size: 22, bold: true }, // 見出し5: 11pt / 行間 1.0
      },
    },
    // mdast2docx が参照するが既定では未定義のスタイルを補完
    paragraphStyles: [
      {
        id: "blockCode",
        name: "Block Code",
        basedOn: "Normal",
        paragraph: {
          spacing: { before: 120, after: 120, line: 300 },
          shading: { type: ShadingType.CLEAR, fill: CODE_BG }, // プレビューのコード背景
        },
        run: { font: CODE_FONT, size: 20 },
      },
    ],
    characterStyles: [
      {
        id: "code",
        name: "Inline Code",
        run: {
          font: CODE_FONT,
          size: 20, // プレビューの 0.9em
          shading: { type: ShadingType.CLEAR, fill: CODE_BG },
        },
      },
    ],
  },
};

export function exportAsMarkdown(doc: DocRecord, name: string): void {
  const blob = new Blob([doc.body], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, `${sanitizeFileName(name)}.md`);
}

// docx 変換用ライブラリは重いため、使用時にのみ動的 import する
// 戻り値: 出力に含まれなかった画像ノードの枚数 (UI での通知用)
export async function exportAsDocx(doc: DocRecord, name: string): Promise<number> {
  const [{ toDocx }, { unified }, { default: remarkParse }, { default: remarkGfm }, { tablePlugin }, { listPlugin }] =
    await Promise.all([
      import("mdast2docx"),
      import("unified"),
      import("remark-parse"),
      import("remark-gfm"),
      import("@m2d/table"),
      import("@m2d/list"),
    ]);
  const ast = unified().use(remarkParse).use(remarkGfm).parse(doc.body);
  // mdast2docx コアは image ノード非対応 (@m2d/image は意図的に未導入)。
  // 画像ノードはコアの既定挙止 (console.warn + スキップ) で出力から除外されるため、
  // ここでは枚数を数えて呼び出し元で通知させる。
  const skippedImages = countImageNodes(ast);
  // useTitle: false → Markdown の #〜##### がそのまま見出し1〜見出し5 になる
  const blob = (await toDocx(ast, docxProps, {
    useTitle: false,
    plugins: [tablePlugin(), listPlugin(), headingNumbering],
  })) as Blob;
  downloadBlob(blob, `${sanitizeFileName(name)}.docx`);
  return skippedImages;
}

/** mdast ツリー内の image ノードを再帰集計する */
function countImageNodes(node: { type: string; children?: unknown[] }): number {
  let count = node.type === "image" ? 1 : 0;
  for (const child of node.children ?? []) {
    count += countImageNodes(child as { type: string; children?: unknown[] });
  }
  return count;
}

export const BACKUP_VERSION = 1;

export interface BackupFile {
  version: number;
  exportedAt: number;
  documents: DocRecord[];
  commits: CommitRecord[];
}

export function exportBackup(
  docs: DocRecord[],
  commits: CommitRecord[],
  fileName: string,
): void {
  const data: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    documents: docs,
    commits,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlob(blob, fileName || `md-editor-backup-${formatDateTime(Date.now())}.json`);
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSON として読めませんでした");
  }
  const b = data as Partial<BackupFile>;
  if (
    !b ||
    typeof b !== "object" ||
    b.version !== BACKUP_VERSION ||
    !Array.isArray(b.documents) ||
    !Array.isArray(b.commits)
  ) {
    throw new Error("このアプリのバックアップファイルではありません");
  }
  for (const d of b.documents) {
    if (
      !d ||
      typeof d.id !== "string" ||
      typeof d.body !== "string" ||
      typeof d.firstSavedAt !== "number" ||
      typeof d.updatedAt !== "number"
    ) {
      throw new Error("バックアップファイルの文書データが不正です");
    }
  }
  for (const c of b.commits) {
    if (
      !c ||
      typeof c.id !== "string" ||
      typeof c.docId !== "string" ||
      typeof c.timestamp !== "number" ||
      typeof c.body !== "string"
    ) {
      throw new Error("バックアップファイルのコミットデータが不正です");
    }
  }
  return b as BackupFile;
}
