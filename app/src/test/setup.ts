import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 未启用 vitest globals，需手动注册用例间 DOM 清理
afterEach(cleanup);
