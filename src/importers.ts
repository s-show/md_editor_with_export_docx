const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export function isMarkdownFile(file: File): boolean {
  return /\.(md|markdown|txt)$/i.test(file.name) || file.type.startsWith("text/");
}

export function isBackupFile(file: File): boolean {
  return /\.json$/i.test(file.name) || file.type === "application/json";
}

/** UTF-8 (strict) → 失敗時は SHIFT-JIS → さらに失敗すると非 strict UTF-8 */
export async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`ファイルが大きすぎます (上限 10MB): ${file.name}`);
  }
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder("shift_jis").decode(buf);
    } catch {
      // このブラウザが SHIFT-JIS に対応していない場合は UTF-8 で読み込む
      return new TextDecoder("utf-8").decode(buf);
    }
  }
}

export function fileNameWithoutExt(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim() || "untitled";
}
