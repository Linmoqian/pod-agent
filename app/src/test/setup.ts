import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 未启用 vitest globals,需手动注册用例间 DOM 清理
afterEach(cleanup);

// jsdom 未实现 matchMedia:motion 的 useReducedMotion 与动画分支依赖它
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom 未实现 ResizeObserver:antd 组件(如 Input/Tooltip)内部依赖它
if (typeof window.ResizeObserver !== "function") {
  class ResizeObserverStub {
    observe = () => {};
    unobserve = () => {};
    disconnect = () => {};
  }
  window.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom 未实现 Element.scrollIntoView:消息列表自动滚动依赖它
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
