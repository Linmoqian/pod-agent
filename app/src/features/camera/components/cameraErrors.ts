/*
 * 相机错误分类:getUserMedia 的异常名映射为阶段与可读文案。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

export type CameraPhase =
  | "loading"
  | "preview"
  | "denied"
  | "missing"
  | "unsupported"
  | "error";

export const CAMERA_ERROR_TEXT: Record<
  "denied" | "missing" | "unsupported" | "error",
  string
> = {
  denied: "相机权限被拒绝,请在系统设置中允许后重试。",
  missing: "未检测到可用的相机设备。",
  unsupported: "当前环境不支持相机。",
  error: "相机启动失败,请重试。",
};

export function toCameraPhase(error: unknown): CameraPhase {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "missing";
  return "error";
}
