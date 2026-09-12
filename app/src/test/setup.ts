import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 未启用 vitest globals,需手动注册用例间 DOM 清理
afterEach(cleanup);

// Node 26 在未指定持久化文件时暴露空 localStorage；测试使用内存实现。
if (!window.localStorage) {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, String(value)),
    },
  });
}

// jsdom 的伪元素样式查询未实现，antd 仅需要元素本身的滚动条样式。
const getComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element: Element) => getComputedStyle(element);

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
