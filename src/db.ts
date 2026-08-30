import { openDB, type IDBPDatabase } from "idb";

export interface DocRecord {
  id: string;
  body: string;
  /** 初回保存のタイムスタンプ (ms)。文書名のフォールバックに使用。不変。 */
  firstSavedAt: number;
  updatedAt: number;
  /** インポート時にファイル名から付けた暫定名 (任意) */
  importedName?: string;
}

export interface CommitRecord {
  id: string;
  docId: string;
  message: string;
  /** コミット時点のタイムスタンプ (ms)、自動記録 */
  timestamp: number;
  /** コミット時点の本文スナップショット */
  body: string;
}

interface DBShape {
  documents: {
    key: string;
    value: DocRecord;
    indexes: { byUpdated: number };
  };
  commits: {
    key: string;
    value: CommitRecord;
    indexes: { byDoc: string };
  };
}

// ネイティブの randomUUID があれば起動時点でキャプチャしておく。
// (非セキュアコンテキストのブラウザでは crypto.randomUUID は存在しない)
const gCrypto = globalThis.crypto;
const nativeRandomUUID =
  gCrypto && typeof gCrypto.randomUUID === "function"
    ? gCrypto.randomUUID.bind(gCrypto)
    : null;

/**
 * 新規 ID 生成。crypto.randomUUID() はセキュアコンテキスト (https/localhost) のみ
 * で使えるため、 http://<LAN IP> で開いた時に壊れないようフォールバックを持つ。
 * 注意: crypto.randomUUID を動的に読むと、下のパッチで自分自身を参照して
 * 無限再帰になるため、ネイティブだけを使う。
 */
export function newId(): string {
  if (nativeRandomUUID) return nativeRandomUUID();
  const bytes = new Uint8Array(16);
  if (gCrypto && typeof gCrypto.getRandomValues === "function") {
    gCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// 依存パッケージ (例: @m2d/list が docx 生成中に直接 crypto.randomUUID() を呼ぶ) を
// 非セキュアコンテキスト (http://IP 等) でも動かすため、ネイティブがない時のみ
// 起動時に一回だけパッチする (newId は nativeRandomUUID 経由なので再帰しない)
if (gCrypto && !nativeRandomUUID) {
  try {
    Object.defineProperty(gCrypto, "randomUUID", { value: () => newId() });
  } catch {
    // crypto が拡張不可の環境は稀なのでその場合は諦める
  }
}

const DB_NAME = "md-editor";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DBShape>> | null = null;

export function getDB(): Promise<IDBPDatabase<DBShape>> {
  if (!dbPromise) {
    dbPromise = openDB<DBShape>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const docs = db.createObjectStore("documents", { keyPath: "id" });
        docs.createIndex("byUpdated", "updatedAt");
        const commits = db.createObjectStore("commits", { keyPath: "id" });
        commits.createIndex("byDoc", "docId");
      },
    });
  }
  return dbPromise;
}

export async function putDocument(doc: DocRecord): Promise<void> {
  const db = await getDB();
  await db.put("documents", doc);
}

export async function getAllDocuments(): Promise<DocRecord[]> {
  const db = await getDB();
  return db.getAll("documents");
}

export async function getDocument(id: string): Promise<DocRecord | undefined> {
  const db = await getDB();
  return db.get("documents", id);
}

/** 文書とその全コミットを 1 トランザクションで削除 */
export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["documents", "commits"], "readwrite");
  const commitStore = tx.objectStore("commits");
  const keys = await commitStore.index("byDoc").getAllKeys(id);
  for (const k of keys) await commitStore.delete(k);
  await tx.objectStore("documents").delete(id);
  await tx.done;
}

export async function putCommit(commit: CommitRecord): Promise<void> {
  const db = await getDB();
  await db.put("commits", commit);
}

export async function getCommits(docId: string): Promise<CommitRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex("commits", "byDoc", docId);
}

export async function deleteCommits(docId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("commits", "readwrite");
  const keys = await tx.store.index("byDoc").getAllKeys(docId);
  for (const k of keys) await tx.store.delete(k);
  await tx.done;
}

export async function putCommits(list: CommitRecord[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("commits", "readwrite");
  for (const c of list) await tx.store.put(c);
  await tx.done;
}
