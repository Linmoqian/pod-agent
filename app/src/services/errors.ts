/*
 * 统一格式化 Rust/Agent 边界错误，保留稳定错误码并避免输出未知对象的 [object Object]。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

export function errorText(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const value = error as Record<string, unknown>;
    const code =
      typeof value.code === "string"
        ? value.code
        : typeof value.errorCode === "string"
          ? value.errorCode
          : null;
    const message = typeof value.message === "string" ? value.message : null;
    if (code && message) return `${code}: ${message}`;
    if (message) return message;
  }
  return String(error);
}
