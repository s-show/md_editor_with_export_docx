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
  /** primary 色のテキストボタン (MD3 ダイアログ action は全てテキストボタン) */
  primary?: boolean;
  /** 破壊的 action を示す error 色テキストボタン */
  danger?: boolean;
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
  wide = false,
): void {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal" + (wide ? " wide" : "");

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
    btn.className = act.danger
      ? "btn btn-dialog-danger"
      : act.primary
        ? "btn btn-dialog-primary"
        : "btn";
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
  danger = false,
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
        danger,
        onClick: () => {
          closeModal();
          resolve(true);
        },
      },
    ]);
  });
}

/* ---- snackbar (MD3): 一時的な結果通知 ---- */
let snackbarEl: HTMLDivElement | null = null;
let snackbarTimer: number | null = null;

export function showSnackbar(
  message: string,
  actionLabel?: string,
  onAction?: () => void,
): void {
  if (snackbarEl && snackbarTimer !== null) {
    clearTimeout(snackbarTimer);
    snackbarEl.remove();
  }
  const el = document.createElement("div");
  el.className = "md-snackbar";
  const span = document.createElement("span");
  span.className = "snackbar-msg";
  span.textContent = message;
  span.title = message;
  el.appendChild(span);

  function dismiss(): void {
    if (snackbarTimer !== null) clearTimeout(snackbarTimer);
    el.classList.remove("visible");
    window.setTimeout(() => {
      el.remove();
      if (snackbarEl === el) snackbarEl = null;
    }, 250);
  }

  if (actionLabel) {
    const btn = document.createElement("button");
    btn.className = "snackbar-action";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      const cb = onAction;
      dismiss();
      cb?.();
    });
    el.appendChild(btn);
  }

  document.body.appendChild(el);
  snackbarEl = el;
  requestAnimationFrame(() => el.classList.add("visible"));
  snackbarTimer = window.setTimeout(dismiss, actionLabel ? 5000 : 4000);
}
