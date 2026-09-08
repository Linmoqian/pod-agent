import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("渲染应用标题与说明", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Pod Agent" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/应用骨架已就绪/)).toBeInTheDocument();
  });
});
