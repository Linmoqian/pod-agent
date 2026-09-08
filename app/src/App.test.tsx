import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
  it("路由到首页并渲染应用标题", () => {
    renderApp();
    expect(
      screen.getByRole("heading", { name: "Pod Agent" }),
    ).toBeInTheDocument();
  });

  it("首页渲染 GFM 表格与图标", () => {
    renderApp();
    expect(screen.getByText("中黄 13")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /大豆育种 Agent/ }),
    ).toBeInTheDocument();
  });
});
