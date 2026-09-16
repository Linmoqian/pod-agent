/*
 * 设置模态测试:独立页面切换、主题副作用、模式持久化与系统跟随。
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
  it("将外观、工作模式与关于渲染为独立页面", async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(screen.getByRole("heading", { name: "外观" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "模式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "关于" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /工作模式/ }));
    expect(screen.getByRole("heading", { name: "模式" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "外观" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /关于/ }));
    expect(screen.getByRole("heading", { name: "关于" })).toBeInTheDocument();
    expect(screen.getAllByText("Lian Agent").length).toBeGreaterThan(0);
    expect(screen.getByText("智能育种助手，老牛持续开发中......")).toBeInTheDocument();
    expect(screen.getByText(`v${version}`)).toBeInTheDocument();
  });

  it("在关于页展示三位开发人员肖像与名称", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: /关于/ }));
    expect(screen.getByRole("img", { name: "linmoqian 的开发人员肖像" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "qcl 的开发人员肖像" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "牛学长 的开发人员肖像" })).toBeInTheDocument();
    expect(screen.getByText("linmoqian")).toBeInTheDocument();
    expect(screen.getByText("qcl")).toBeInTheDocument();
    expect(screen.getByText("牛学长")).toBeInTheDocument();
    expect(screen.getByLabelText("支持单位：华南农业大学 生命科学学院")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "华南农业大学校徽" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "生命科学学院校徽" })).toBeInTheDocument();
    expect(screen.getByText("生命科学学院")).toBeInTheDocument();
  });

  it("支持单位徽标链接到对应官网", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: /关于/ }));

    expect(screen.getByRole("link", { name: "访问华南农业大学官网" })).toHaveAttribute(
      "href",
      "https://scau.edu.cn/",
    );
    expect(screen.getByRole("link", { name: "访问生命科学学院官网" })).toHaveAttribute(
      "href",
      "https://life.scau.edu.cn/",
    );
  });

  it("默认浅色主题与新手模式,选中卡片以 aria-pressed 标记", async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: /浅色/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: /工作模式/ }));
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
    await user.click(screen.getByRole("button", { name: /工作模式/ }));
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

  it("再次打开时从 localStorage 恢复深色主题与开发人员模式", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "pod-agent.settings",
      JSON.stringify({ themePreference: "dark", experienceMode: "developer" }),
    );
    renderSettings();
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(screen.getByRole("button", { name: /工作模式/ }));
    expect(screen.getByRole("button", { name: /开发人员/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
