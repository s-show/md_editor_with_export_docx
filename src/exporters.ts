import type { CommitRecord, DocRecord } from "./db";
import { downloadBlob } from "./ui";
import { formatDateTime, sanitizeFileName } from "./markdown";

export function exportAsMarkdown(doc: DocRecord, name: string): void {
  const blob = new Blob([doc.body], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, `${sanitizeFileName(name)}.md`);
}

// docx 変換用ライブラリは重いため、使用時にのみ動的 import する
export async function exportAsDocx(doc: DocRecord, name: string): Promise<void> {
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
  // 画像は docx に含めない (ローカル画像で変換が失敗しないため)
  const blob = (await toDocx(ast, {}, {
    plugins: [tablePlugin(), listPlugin()],
  })) as Blob;
  downloadBlob(blob, `${sanitizeFileName(name)}.docx`);
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
