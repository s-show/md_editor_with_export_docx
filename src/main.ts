import "./styles.css";
import {
  deleteCommits,
  deleteDocument,
  getAllDocuments,
  getCommits,
  newId,
  putCommit,
  putCommits,
  putDocument,
  type CommitRecord,
  type DocRecord,
} from "./db";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
import {
  docDisplayName,
  extractOutline,
  formatDateTime,
  formatTime,
  renderMarkdown,
} from "./markdown";
import {
  attachRipple,
  closeModal,
  confirmDialog,
  openModal,
  showSnackbar,
} from "./ui";
import {
  exportAsDocx,
  exportAsMarkdown,
  exportBackup,
  parseBackup,
} from "./exporters";
import {
  fileNameWithoutExt,
  isBackupFile,
  isMarkdownFile,
  readTextFile,
} from "./importers";
import { requestCommitMessage, showDiffModal } from "./commits";

// ---- DOM refs ----
const editorEl = document.getElementById("editor") as HTMLTextAreaElement;
const previewEl = document.getElementById("preview") as HTMLDivElement;
const docListEl = document.getElementById("doc-list") as HTMLUListElement;
const commitListEl = document.getElementById("commit-list") as HTMLUListElement;
const outlineEl = document.getElementById("outline") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;
const docTitleEl = document.getElementById("doc-title") as HTMLSpanElement;
const centerBodyEl = document.getElementById("center-body") as HTMLDivElement;
const splitterEl = document.getElementById("splitter") as HTMLDivElement;
const diffSelectedBtn = document.getElementById(
  "btn-diff-selected",
) as HTMLButtonElement;
const fileInputEl = document.getElementById(
  "file-input",
) as HTMLInputElement;
const exportMenuEl = document.getElementById(
  "export-menu",
) as HTMLDetailsElement;
const centerModeBtns: Record<CenterMode, HTMLButtonElement> = {
  editor: document.getElementById("btn-mode-editor") as HTMLButtonElement,
  split: document.getElementById("btn-mode-split") as HTMLButtonElement,
  preview: document.getElementById("btn-mode-preview") as HTMLButtonElement,
};
const btnToggleLeft = document.getElementById(
  "btn-toggle-left",
) as HTMLButtonElement;
const btnToggleRight = document.getElementById(
  "btn-toggle-right",
) as HTMLButtonElement;
const themeSelectEl = document.getElementById(
  "theme-select",
) as HTMLSelectElement | null;

// ---- theme switcher ----
const THEME_STORAGE_KEY = "md_editor_theme_v2";
const DEFAULT_THEME = "minimal-contrast";

function applyTheme(theme: string): void {
  document.documentElement.dataset.theme = theme;
  if (themeSelectEl && themeSelectEl.value !== theme) {
    themeSelectEl.value = theme;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage errors
  }
}

function initTheme(): void {
  let savedTheme: string | null = null;
  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // ignore
  }
  const theme = savedTheme || DEFAULT_THEME;
  applyTheme(theme);

  themeSelectEl?.addEventListener("change", () => {
    applyTheme(themeSelectEl.value);
  });
}

// ---- state ----
let docs: DocRecord[] = [];
let currentId: string | null = null;
let commits: CommitRecord[] = [];
let saveTimer: number | null = null;
let previewTimer: number | null = null;
type CenterMode = "split" | "editor" | "preview";
let centerMode: CenterMode = "split";

const LINE_HEIGHT = 21;

// ---- helpers ----
function setStatus(text: string): void {
  statusEl.textContent = text;
}

function currentDoc(): DocRecord | null {
  return docs.find((d) => d.id === currentId) ?? null;
}

// ---- preview / outline ----
function renderPreviewNow(): void {
  previewEl.innerHTML = renderMarkdown(editorEl.value);
}

function renderOutlineNow(): void {
  const items = extractOutline(editorEl.value);
  outlineEl.replaceChildren();
  if (items.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-hint";
    p.textContent = "見出しがありません";
    outlineEl.appendChild(p);
    return;
  }
  for (const it of items) {
    const btn = document.createElement("button");
    btn.className = "outline-item";
    btn.style.paddingLeft = `${8 + (it.level - 1) * 14}px`;
    btn.textContent = it.text;
    btn.addEventListener("click", () => jumpToLine(it.line));
    outlineEl.appendChild(btn);
  }
}

function jumpToLine(line: number): void {
  if (centerMode === "preview") setCenterMode("split");
  const lines = editorEl.value.split("\n");
  let pos = 0;
  for (let i = 0; i < line; i++) pos += (lines[i]?.length ?? 0) + 1;
  editorEl.focus();
  editorEl.setSelectionRange(pos, pos + (lines[line]?.length ?? 0));
  editorEl.scrollTop = Math.max(0, line * LINE_HEIGHT - 40);
}

// ---- autosave ----
function onInput(): void {
  if (!currentId) {
    setStatus("文書が選択されていません。自動保存・コミットはされません");
    return;
  }
  setStatus("未保存の変更があります…");
  if (previewTimer !== null) clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    renderPreviewNow();
    renderOutlineNow();
  }, 250);
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void flushSave(), 500);
}

async function flushSave(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const doc = currentDoc();
  if (!doc) return;
  const now = Date.now();
  const updated: DocRecord = { ...doc, body: editorEl.value, updatedAt: now };
  docs = docs.map((d) => (d.id === updated.id ? updated : d));
  try {
    await putDocument(updated);
    setStatus(`自動保存済み ${formatTime(now)}`);
    docTitleEl.textContent = docDisplayName(updated);
    renderDocList();
  } catch (e) {
    console.error("autosave failed", e);
    setStatus(`自動保存に失敗しました: ${errMsg(e)}`);
  }
}

// ---- document list ----
function renderDocList(): void {
  docListEl.replaceChildren();
  const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
  if (sorted.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "文書がありません。「新規文書」ボタンで作成してください";
    docListEl.appendChild(li);
    return;
  }
  const selectDoc = (d: DocRecord) =>
    void selectDocument(d.id).catch((e) => {
      console.error("select document failed", e);
      alert(`文書の開きに失敗しました: ${errMsg(e)}`);
    });

  for (const d of sorted) {
    const li = document.createElement("li");
    li.className = "doc-item" + (d.id === currentId ? " active" : "");
    const main = document.createElement("div");
    main.className = "doc-main";
    const name = document.createElement("span");
    name.className = "doc-name";
    name.textContent = docDisplayName(d);
    name.title = docDisplayName(d);
    const time = document.createElement("span");
    time.className = "doc-time";
    time.textContent = `最終更新 ${formatTime(d.updatedAt)}`;
    main.append(name, time);
    li.append(main);
    // キーボード操作 (Tab で移動、Enter/Space で選択)
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.addEventListener("click", () => selectDoc(d));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectDoc(d);
      }
    });
    docListEl.appendChild(li);
  }
}

async function selectDocument(id: string): Promise<void> {
  if (id === currentId) return;
  await flushSave();
  currentId = id;
  const doc = currentDoc();
  if (!doc) return;
  editorEl.value = doc.body;
  renderPreviewNow();
  renderOutlineNow();
  docTitleEl.textContent = docDisplayName(doc);
  renderDocList();
  await loadCommitPanel();
  setStatus("");
}

async function newDocument(): Promise<void> {
  await flushSave();
  const now = Date.now();
  const doc: DocRecord = {
    id: newId(),
    body: "",
    firstSavedAt: now,
    updatedAt: now,
  };
  docs.push(doc);
  try {
    await putDocument(doc);
  } catch (e) {
    console.error("create document failed", e);
    docs = docs.filter((d) => d.id !== doc.id);
    alert(`新規文書の作成に失敗しました: ${errMsg(e)}`);
    renderDocList();
    return;
  }
  currentId = doc.id;
  editorEl.value = "";
  renderPreviewNow();
  renderOutlineNow();
  docTitleEl.textContent = docDisplayName(doc);
  renderDocList();
  await loadCommitPanel().catch((e) => {
    console.error("load commit panel failed", e);
  });
  editorEl.focus();
}

async function deleteCurrentDocument(): Promise<void> {
  const doc = currentDoc();
  if (!doc) return;
  const ok = await confirmDialog(
    `文書「${docDisplayName(doc)}」を削除します。コミット履歴も削除されます。よろしいですか？`,
    "削除",
    true,
  );
  if (!ok) return;
  const id = doc.id;
  await deleteDocument(id);
  docs = docs.filter((d) => d.id !== id);
  currentId = null;
  editorEl.value = "";
  renderPreviewNow();
  renderOutlineNow();
  renderDocList();
  const next = [...docs].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (next) {
    await selectDocument(next.id);
  } else {
    docTitleEl.textContent = "";
    commits = [];
    renderCommitPanel();
  }
}

// ---- commits ----
async function loadCommitPanel(): Promise<void> {
  commits = currentId ? await getCommits(currentId) : [];
  renderCommitPanel();
}

function emptyCommitHint(text: string): void {
  const li = document.createElement("li");
  li.className = "empty-hint";
  li.textContent = text;
  commitListEl.appendChild(li);
}

function renderCommitPanel(): void {
  commitListEl.replaceChildren();
  diffSelectedBtn.disabled = true;
  if (!currentId) {
    emptyCommitHint("文書が選択されていません");
    return;
  }
  if (commits.length === 0) {
    emptyCommitHint("まだコミットはありません。「コミット」ボタンで記録できます");
    return;
  }
  const sorted = [...commits].sort((a, b) => a.timestamp - b.timestamp);
  sorted.forEach((c, idx) => {
    const li = document.createElement("li");
    li.className = "commit-item";
    li.dataset.id = c.id;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.title = "比較用に選択";
    const main = document.createElement("div");
    main.className = "commit-main";
    const label = document.createElement("span");
    label.className = "commit-msg";
    label.textContent = c.message || "(メッセージなし)";
    label.title = c.message;
    const time = document.createElement("span");
    time.className = "commit-time";
    time.textContent = formatDateTime(c.timestamp);
    main.append(label, time);
    const btn = document.createElement("button");
    btn.className = "btn small icon-btn";
    btn.innerHTML = '<span class="md-icon sm">compare</span>';
    btn.disabled = idx === 0;
    btn.title = "直前のコミットとの差分を表示";
    btn.addEventListener("click", () => showDiffModal(sorted[idx - 1], c));
    cb.addEventListener("change", updateDiffSelectedBtn);
    li.append(cb, main, btn);
    commitListEl.appendChild(li);
  });
  updateDiffSelectedBtn();
}

function updateDiffSelectedBtn(): void {
  const checkedIds = Array.from(
    commitListEl.querySelectorAll<HTMLLIElement>(
      "li.commit-item:has(input:checked)",
    ),
  ).map((li) => li.dataset.id as string);
  diffSelectedBtn.disabled = checkedIds.length !== 2;
  if (checkedIds.length !== 2) return;
  const pair = checkedIds
    .map((id) => commits.find((c) => c.id === id))
    .filter((c): c is CommitRecord => Boolean(c))
    .sort((a, b) => a.timestamp - b.timestamp);
  diffSelectedBtn.onclick = () => showDiffModal(pair[0], pair[1]);
}

async function onCommitClick(): Promise<void> {
  if (!currentId) {
    setStatus("コミット対象の文書が選択されていません");
    return;
  }
  await flushSave();
  const msg = await requestCommitMessage();
  if (msg === null) return;
  const commit: CommitRecord = {
    id: newId(),
    docId: currentId,
    message: msg,
    timestamp: Date.now(),
    body: editorEl.value,
  };
  try {
    await putCommit(commit);
    await loadCommitPanel();
    showSnackbar(`コミット済み ${formatTime(commit.timestamp)}`);
  } catch (e) {
    console.error("commit failed", e);
    alert(`コミットに失敗しました: ${errMsg(e)}`);
  }
}

// ---- export ----
async function onExportMd(): Promise<void> {
  const doc = currentDoc();
  if (!doc) return;
  await flushSave();
  const fresh = currentDoc();
  if (!fresh) return;
  try {
    exportAsMarkdown(fresh, docDisplayName(fresh));
    showSnackbar(".md ファイルをエクスポートしました");
  } catch (e) {
    console.error("export md failed", e);
    alert(`.md エクスポートに失敗しました: ${errMsg(e)}`);
  }
}

async function onExportDocx(): Promise<void> {
  const doc = currentDoc();
  if (!doc) return;
  const btn = document.getElementById(
    "btn-export-docx",
  ) as HTMLButtonElement;
  // クリック時点で進行中のリップル span を除いてクリーンなマークアップを保持
  const original = btn.innerHTML.replace(/<span class="md-ripple"[^>]*><\/span>/g, "");
  btn.disabled = true;
  btn.textContent = "生成中…";
  try {
    await flushSave();
    const fresh = currentDoc();
    if (!fresh) return;
    await exportAsDocx(fresh, docDisplayName(fresh));
    showSnackbar(".docx ファイルをエクスポートしました");
  } catch (e) {
    console.error("docx export failed", e);
    alert(`.docx 生成に失敗しました: ${e instanceof Error ? e.message : String(e)}\n詳細はコンソール (F12) を確認してください`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

async function onExportBackupJson(): Promise<void> {
  try {
    const allCommits: CommitRecord[] = [];
    for (const d of docs) allCommits.push(...(await getCommits(d.id)));
    exportBackup(docs, allCommits, `md-editor-backup-${formatDateTime(Date.now()).replace(/[-: ]/g, "")}.json`);
    showSnackbar("バックアップ (JSON) をエクスポートしました");
  } catch (e) {
    console.error("export backup failed", e);
    alert(`バックアップエクスポートに失敗しました: ${errMsg(e)}`);
  }
}

// ---- import ----
async function importMarkdownFile(
  file: File,
  importedIds: string[],
): Promise<void> {
  const text = await readTextFile(file);
  const now = Date.now();
  const doc: DocRecord = {
    id: newId(),
    body: text,
    firstSavedAt: now,
    updatedAt: now,
    importedName: fileNameWithoutExt(file.name),
  };
  docs.push(doc);
  await putDocument(doc);
  importedIds.push(doc.id);
}

async function importBackupFile(file: File, messages: string[]): Promise<void> {
  const text = await readTextFile(file);
  const data = parseBackup(text);
  const existing = new Set(docs.map((d) => d.id));
  const conflicts = data.documents.filter((d) => existing.has(d.id));
  if (conflicts.length > 0) {
    const ok = await confirmDialog(
      `${conflicts.length} 件の文書が既存と同じ ID を持ちます。既存を置き換えますか？`,
      "置き換える",
    );
    if (!ok) {
      messages.push(`${file.name}: スキップ (ID 重複)`);
      return;
    }
  }
  for (const d of data.documents) {
    if (existing.has(d.id)) {
      await deleteCommits(d.id);
      docs = docs.map((x) => (x.id === d.id ? d : x));
    } else {
      docs.push(d);
    }
    await putDocument(d);
  }
  const keptIds = new Set(data.documents.map((d) => d.id));
  const commitsToImport = data.commits.filter((c) => keptIds.has(c.docId));
  if (commitsToImport.length > 0) await putCommits(commitsToImport);
  messages.push(
    `${file.name}: ${data.documents.length} 文書 / ${commitsToImport.length} コミット をインポート`,
  );
}

async function handleFiles(fileList: FileList | File[]): Promise<void> {
  const files = Array.from(fileList);
  if (files.length === 0) return;
  const messages: string[] = [];
  const importedIds: string[] = [];
  for (const file of files) {
    try {
      if (isBackupFile(file)) {
        await importBackupFile(file, messages);
      } else if (isMarkdownFile(file)) {
        await importMarkdownFile(file, importedIds);
        messages.push(`${file.name}: 新規文書としてインポート`);
      } else {
        messages.push(`${file.name}: スキップ (非対応形式)`);
      }
    } catch (e) {
      messages.push(`${file.name}: 失敗 - ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (importedIds.length > 0 && importedIds[0] !== currentId) {
    await selectDocument(importedIds[0]);
  }
  renderDocList();
  const p = document.createElement("p");
  p.style.whiteSpace = "pre-line";
  p.textContent = messages.join("\n");
  openModal("インポート結果", p, [
    { label: "OK", primary: true, onClick: closeModal },
  ]);
}

// ---- layout ----
function setCenterMode(mode: CenterMode): void {
  centerMode = mode;
  centerBodyEl.classList.toggle("mode-editor", mode === "editor");
  centerBodyEl.classList.toggle("mode-preview", mode === "preview");
  for (const [m, b] of Object.entries(centerModeBtns) as [
    CenterMode,
    HTMLButtonElement,
  ][]) {
    b.setAttribute("aria-pressed", String(m === mode));
    b.classList.toggle("active", m === mode);
  }
  localStorage.setItem("ui:centerMode", mode);
}

function toggleLeft(): void {
  const hidden = document.body.classList.toggle("hide-left");
  localStorage.setItem("ui:left", hidden ? "0" : "1");
  btnToggleLeft.classList.toggle("active", !hidden);
}

function toggleRight(): void {
  const hidden = document.body.classList.toggle("hide-right");
  localStorage.setItem("ui:right", hidden ? "0" : "1");
  btnToggleRight.classList.toggle("active", !hidden);
}

function initSplitter(): void {
  const saved = localStorage.getItem("ui:split");
  if (saved) centerBodyEl.style.setProperty("--split", saved);
  splitterEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const rect = centerBodyEl.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const pct = Math.min(85, Math.max(15, ((ev.clientX - rect.left) / rect.width) * 100));
      centerBodyEl.style.setProperty("--split", `${pct}%`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      localStorage.setItem("ui:split", centerBodyEl.style.getPropertyValue("--split"));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

// ---- init ----
async function init(): Promise<void> {
  if (localStorage.getItem("ui:left") === "0") document.body.classList.add("hide-left");
  else btnToggleLeft.classList.add("active");
  if (localStorage.getItem("ui:right") === "0") document.body.classList.add("hide-right");
  else btnToggleRight.classList.add("active");
  centerMode = (localStorage.getItem("ui:centerMode") as CenterMode) || "split";
  setCenterMode(centerMode);
  initSplitter();
  attachRipple();
  initTheme();

  // ドロップダウン (details) をメニュー外クリックで閉じる
  const exportMenu = document.getElementById(
    "export-menu",
  ) as HTMLDetailsElement;
  document.addEventListener("click", (e) => {
    if (exportMenu.open && !exportMenu.contains(e.target as Node)) {
      exportMenu.open = false;
    }
  });

  editorEl.addEventListener("input", onInput);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushSave();
  });
  window.addEventListener("beforeunload", () => void flushSave());

  document.getElementById("btn-new")!.addEventListener("click", () => void newDocument());
  document.getElementById("btn-delete-doc")!.addEventListener("click", () => void deleteCurrentDocument());
  document.getElementById("btn-commit")!.addEventListener("click", () => void onCommitClick());
  btnToggleLeft.addEventListener("click", toggleLeft);
  btnToggleRight.addEventListener("click", toggleRight);
  for (const m of Object.keys(centerModeBtns) as CenterMode[]) {
    centerModeBtns[m].addEventListener("click", () => setCenterMode(m));
  }

  document.getElementById("btn-export-md")!.addEventListener("click", () => void onExportMd());
  const btnExportDocx = document.getElementById("btn-export-docx")!;
  btnExportDocx.addEventListener("click", () => void onExportDocx());
  document.getElementById("btn-export-json")!.addEventListener("click", () => onExportBackupJson());
  for (const btn of exportMenuEl.querySelectorAll<HTMLButtonElement>(".menu-items button")) {
    btn.addEventListener("click", () => {
      exportMenuEl.open = false;
    });
  }

  document.getElementById("btn-import")!.addEventListener("click", () => fileInputEl.click());
  fileInputEl.addEventListener("change", () => {
    if (fileInputEl.files) void handleFiles(fileInputEl.files);
    fileInputEl.value = "";
  });

  // ドラッグ & ドロップ (ウィンドウ全体)
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  });

  // キーボードショートカット
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      if (exportMenuEl.open) exportMenuEl.open = false;
    }
    if (e.altKey && e.code === "Digit1") {
      e.preventDefault();
      toggleLeft();
    } else if (e.altKey && e.code === "Digit2") {
      e.preventDefault();
      toggleRight();
    }
  });

  docs = await getAllDocuments();
  if (docs.length === 0) {
    // 文書が 0 件のまま入力すると自動保存・コミットが対象なしで無視されるため、
    // 最初の文書を自動作成する
    const now = Date.now();
    const doc: DocRecord = {
      id: newId(),
      body: "",
      firstSavedAt: now,
      updatedAt: now,
    };
    docs.push(doc);
    await putDocument(doc);
  }
  renderDocList();
  const first = [...docs].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (first) await selectDocument(first.id);
}

void init().catch((e) => {
  console.error("init failed", e);
  setStatus(`初期化に失敗しました: ${errMsg(e)}`);
  alert(`アプリの初期化に失敗しました: ${errMsg(e)}`);
});
