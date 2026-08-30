import { createTwoFilesPatch } from "diff";
import type { CommitRecord } from "./db";
import { closeModal, openModal } from "./ui";
import { formatDateTime } from "./markdown";

/** コミットメッセージの入力モーダルを表示し、決定したらメッセージ、キャンセルなら null */
export function requestCommitMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    const p = document.createElement("p");
    p.textContent = "現在の本文をコミットします。メッセージを入力してください (空欄可)。";
    const ta = document.createElement("textarea");
    ta.rows = 3;
    ta.className = "commit-message-input";
    ta.placeholder = "例: 導入部を追加";
    wrap.append(p, ta);

    openModal("コミット", wrap, [
      {
        label: "キャンセル",
        onClick: () => {
          closeModal();
          resolve(null);
        },
      },
      {
        label: "コミット",
        primary: true,
        onClick: () => {
          const msg = ta.value.trim();
          closeModal();
          resolve(msg);
        },
      },
    ]);
    setTimeout(() => ta.focus(), 0);
  });
}

function renderDiffPatch(patch: string): HTMLElement {
  const pre = document.createElement("pre");
  pre.className = "diff-view";
  for (const line of patch.split("\n")) {
    const span = document.createElement("span");
    span.textContent = line.length > 0 ? line : " ";
    if (line.startsWith("+++") || line.startsWith("---")) {
      span.className = "diff-meta";
    } else if (line.startsWith("@@")) {
      span.className = "diff-hunk";
    } else if (line.startsWith("+")) {
      span.className = "diff-add";
    } else if (line.startsWith("-")) {
      span.className = "diff-del";
    }
    pre.appendChild(span);
  }
  return pre;
}

export function showDiffModal(a: CommitRecord, b: CommitRecord): void {
  let patch = createTwoFilesPatch(
    `${formatDateTime(a.timestamp)}`,
    `${formatDateTime(b.timestamp)}`,
    a.body,
    b.body,
  );
  const wrap = document.createElement("div");
  const info = document.createElement("p");
  info.textContent = `${formatDateTime(a.timestamp)} → ${formatDateTime(b.timestamp)}`;
  wrap.appendChild(info);
  if (patch.trim().length === 0) {
    const p = document.createElement("p");
    p.textContent = "差分はありません";
    wrap.appendChild(p);
  } else {
    wrap.appendChild(renderDiffPatch(patch));
  }
  openModal("コミット間の差分 (Unified Diff)", wrap, [
    { label: "閉じる", primary: true, onClick: closeModal },
  ]);
}
