// public/favicon.ico 生成スクリプト
//
// 経緯: favicon generator 系の出力は `.ico` の実体が PNG 32x32 のままになっていることがある
// (本リポジトリでも favicon.ico が favicon-32x32.png とバイト一致だった)。
// Chrome / Firefox は <link rel="icon" type="image/png"> を優先するのでタブ表示はできるが、
// /favicon.ico を直接取りに行くクライアント (Windows ショートカット、一部の Linux DE、
// クローラ、ボット) では壊れる。そこで sharp から PNG ペイロードを取り出し、
// ICO コンテナ (ICONDIR + ICONDIRENTRY[]) を自前で組んで埋め直す。
//
// 使い方:
//   node scripts/gen-favicon-ico.mjs                       # public/android-chrome-512x512.png から生成
//   node scripts/gen-favicon-ico.mjs <src.png> [16 32 48 64] [out.ico]
//
// PNG-in-ICO は Windows Vista 以降 / Chrome / Firefox / Safari でサポートされている。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const rest = process.argv.slice(2);
const srcArg = rest.find((a) => /\.png$/i.test(a)) || "public/android-chrome-512x512.png";
const outArg = rest.find((a) => /\.ico$/i.test(a)) || "public/favicon.ico";
const sizes = rest
  .filter((a) => /^\d+$/.test(a) && a !== srcArg && a !== outArg)
  .map(Number)
  .filter((n) => n >= 16 && n <= 256);
const SIZES = sizes.length ? sizes : [16, 24, 32, 48, 64];

const srcPath = resolve(repoRoot, srcArg);
const outPath = resolve(repoRoot, outArg);
if (!existsSync(srcPath)) {
  console.error(`source not found: ${srcPath}`);
  process.exit(1);
}

// 各サイズを PNG (RGBA, 非インターレス) へ変換。
// 既存の public/favicon-{size}x{size}.png があればそれをそのまま使う
// (タブに張られる PNG リンクと ICO のピクセルを一致させるため)。
const publicDir = resolve(repoRoot, "public");
const images = [];
for (const size of SIZES) {
  const preset = join(publicDir, `favicon-${size}x${size}.png`);
  let buf;
  let from;
  if (existsSync(preset) && (await sharp(preset).metadata()).width === size) {
    buf = readFileSync(preset);
    from = "preset";
  } else {
    buf = await sharp(srcPath)
      .ensureAlpha()
      .resize(size, size, { fit: "fill", kernel: "lanczos3" })
      .png({ compressionLevel: 9, interlaced: false })
      .toBuffer();
    from = "resized";
  }
  images.push({ size, buf });
  console.log(`  ${String(size).padStart(3)}x${String(size).padEnd(3)}  ${String(buf.length).padStart(6)}B  ${from}`);
}

// ICO コンテナ組み立て
// ICONDIR: reserved(2)=0 | type(2)=1 | count(2)
// ICONDIRENTRY(16): w(1) | h(1) | palette(1) | reserved(1) | planes(2) | bitCount(2) | bytes(4) | offset(4)
const HEADER = 6;
const ENTRY = 16;
const dir = Buffer.alloc(HEADER + images.length * ENTRY);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type = icon
dir.writeUInt16LE(images.length, 4); // count

let cursor = dir.length;
images.forEach((img, i) => {
  const base = HEADER + i * ENTRY;
  const dim = img.size >= 256 ? 0 : img.size; // 256 は 0 で表現する
  dir.writeUInt8(dim, base + 0);
  dir.writeUInt8(dim, base + 1);
  dir.writeUInt8(0, base + 2); // 色数 (0 = 真色)
  dir.writeUInt8(0, base + 3); // reserved
  dir.writeUInt16LE(1, base + 4); // planes (ICO 慣例で 1)
  dir.writeUInt16LE(32, base + 6); // bitCount
  dir.writeUInt32LE(img.buf.length, base + 8);
  dir.writeUInt32LE(cursor, base + 12);
  cursor += img.buf.length;
});

writeFileSync(outPath, Buffer.concat([dir, ...images.map((x) => x.buf)]));

const bytes = readFileSync(outPath);
const count = bytes.readUInt16LE(4);
const ok = bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1;
console.log(`\nWrote ${outPath}`);
console.log(`  ICONDIR valid: ${ok}, images: ${count}, total: ${bytes.length}B`);
for (let i = 0; i < count; i++) {
  const base = HEADER + i * ENTRY;
  const w = bytes.readUInt8(base) || 256;
  const h = bytes.readUInt8(base + 1) || 256;
  const off = bytes.readUInt32LE(base + 12);
  const len = bytes.readUInt32LE(base + 8);
  const magic = bytes.slice(off, off + 8).toString("hex");
  const kind = magic.startsWith("89504e47") ? "PNG" : magic.slice(0, 4) === "28000000" ? "BMP(DIB)" : "?";
  console.log(`  entry ${i}: ${w}x${h} ${kind} @${off} +${len}B`);
}
