/**
 * 「已复制」状态停留时间（复制成功反馈的唯一来源）。
 *
 * 地址组件与回执哈希行都用它：同一个交互反馈没有理由各写一个 `2000`。
 */
export const COPY_FEEDBACK_MS = 2000;

/** Clipboard copy with a single boolean result; UI renders a transient 已复制 state. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}
