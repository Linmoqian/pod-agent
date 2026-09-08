/*
 * 设置模态测试:三区块渲染、主题切换副作用、模式持久化与系统跟随。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { version } from "../../../../package.json";
import SettingsModal from "./SettingsModal";
import { SettingsProvider } from "../context";

function renderSettings() {
  return render(
    <SettingsProvider>
      <SettingsModal open onClose={() => {}} />
    </SettingsProvider>,
  );
}

/* 设置会写 <html data-theme> 与 localStorage,用例间须复位避免相互污染 */
beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

describe("SettingsModal", () => {
  it("渲染外观、模式与关于区块,展示应用名和版本", () => {
    renderSettings();
    expect(screen.getByRole("heading", { name: "外观" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "模式" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "关于" })).toBeInTheDocument();
    expect(screen.getAllByText("Pod Agent").length).toBeGreaterThan(0);
    expect(screen.getByText(`v${version}`)).toBeInTheDocument();
  });

  it("默认浅色主题与新手模式,选中卡片以 aria-pressed 标记", () => {
    renderSettings();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: /浅色/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /新手/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("切换深色主题后写入 <html data-theme> 并持久化", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: /深色/ }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    const stored = JSON.parse(
      window.localStorage.getItem("pod-agent.settings") ?? "{}",
    );
    expect(stored.themePreference).toBe("dark");
  });

  it("切换为专家模式并持久化,选中态随选项移动", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: /专家/ }));
    const stored = JSON.parse(
      window.localStorage.getItem("pod-agent.settings") ?? "{}",
    );
    expect(stored.experienceMode).toBe("expert");
    expect(screen.getByRole("button", { name: /新手/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /专家/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("跟随系统时按操作系统深色偏好解析为 dark", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    );
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: /跟随系统/ }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("再次打开时从 localStorage 恢复深色主题", () => {
    window.localStorage.setItem(
      "pod-agent.settings",
      JSON.stringify({ themePreference: "dark", experienceMode: "developer" }),
    );
    renderSettings();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: /开发人员/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
