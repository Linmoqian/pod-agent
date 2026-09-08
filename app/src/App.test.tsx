import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import App from "./App";

function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  it("渲染侧栏品牌与新建任务入口", () => {
    renderApp();
    expect(screen.getAllByText("Pod Agent").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /新建任务/ }),
    ).toBeInTheDocument();
  });

  it("默认展示首个会话的标题与 Markdown 回复", () => {
    renderApp();
    // 顶栏以 heading 呈现当前会话标题;侧栏同名列表项另计
    expect(
      screen.getByRole("heading", { name: "大豆品种性状咨询" }),
    ).toBeInTheDocument();
    expect(screen.getByText("中黄 13")).toBeInTheDocument();
  });

  it("在输入器中回车发送消息并出现占位回复", async () => {
    const user = userEvent.setup();
    renderApp();
    const input = screen.getByLabelText("消息输入");
    await user.type(input, "帮我查一下合丰 50 的产量{enter}");
    // 同文本会同时出现在会话标题(首条消息截取)与消息气泡中,断言至少存在一处
    expect(
      screen.getAllByText("帮我查一下合丰 50 的产量").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/本地占位回复/).length).toBeGreaterThan(0);
  });
});
