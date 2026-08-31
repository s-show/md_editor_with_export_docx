export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ModalAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

/**
 * MD3 リップル: 対象要素の pointerdown 位置から広がる半透明サークル。
 * イベント委譲で 1 回だけ登録する。対象: .btn / メニュー項目 / リスト項目。
 */
export function attachRipple(): void {
  document.addEventListener("pointerdown", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      ".btn, .seg, .menu-items button, .doc-item, .outline-item",
    );
    if (!target || (target as HTMLButtonElement).disabled) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const span = document.createElement("span");
    span.className = "md-ripple";
    span.style.width = span.style.height = `${size}px`;
    span.style.left = `${e.clientX - rect.left - size / 2}px`;
    span.style.top = `${e.clientY - rect.top - size / 2}px`;
    target.appendChild(span);
    span.addEventListener("animationend", () => span.remove(), { once: true });
  });
}

let overlayEl: HTMLDivElement | null = null;

export function openModal(
  title: string,
  content: HTMLElement,
  actions: ModalAction[],
): void {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal";

  const h = document.createElement("h2");
  h.textContent = title;

  const body = document.createElement("div");
  body.className = "modal-body";
  body.appendChild(content);

  const foot = document.createElement("div");
  foot.className = "modal-actions";
  for (const act of actions) {
    const btn = document.createElement("button");
    btn.textContent = act.label;
    if (act.primary) btn.className = "btn-primary";
    btn.addEventListener("click", () => act.onClick());
    foot.appendChild(btn);
  }

  modal.append(h, body, foot);
  overlay.appendChild(modal);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.body.appendChild(overlay);
  overlayEl = overlay;
}

export function closeModal(): void {
  overlayEl?.remove();
  overlayEl = null;
}

export function confirmDialog(
  message: string,
  okLabel = "実行",
): Promise<boolean> {
  return new Promise((resolve) => {
    const p = document.createElement("p");
    p.textContent = message;
    openModal("確認", p, [
      {
        label: "キャンセル",
        onClick: () => {
          closeModal();
          resolve(false);
        },
      },
      {
        label: okLabel,
        primary: true,
        onClick: () => {
          closeModal();
          resolve(true);
        },
      },
    ]);
  });
}
