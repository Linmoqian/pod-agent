/*
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { describe, expect, it } from "vitest";
import reducer, {
  addCustomProvider,
  removeCustomProvider,
  setCurrentModel,
  setCustomProviders,
} from "../store/providersSlice";

describe("providersSlice", () => {
  it("添加与覆盖自定义提供商", () => {
    let state = reducer(undefined, { type: "init" });
    state = reducer(
      state,
      addCustomProvider({
        id: "custom-1",
        name: "本地 Ollama",
        baseUrl: "http://localhost:11434/v1",
      }),
    );
    expect(state.customProviders).toHaveLength(1);

    state = reducer(state, setCustomProviders([]));
    expect(state.customProviders).toHaveLength(0);
  });

  it("删除自定义提供商时清空其下的当前模型", () => {
    let state = reducer(undefined, { type: "init" });
    state = reducer(
      state,
      addCustomProvider({
        id: "custom-1",
        name: "本地 Ollama",
        baseUrl: "http://localhost:11434/v1",
      }),
    );
    state = reducer(
      state,
      setCurrentModel({ providerId: "custom-1", modelId: "qwen3" }),
    );
    state = reducer(state, removeCustomProvider("custom-1"));
    expect(state.customProviders).toHaveLength(0);
    expect(state.currentModel).toBeNull();
  });

  it("切换当前模型", () => {
    let state = reducer(undefined, { type: "init" });
    state = reducer(
      state,
      setCurrentModel({ providerId: "anthropic", modelId: "claude-x" }),
    );
    expect(state.currentModel).toEqual({
      providerId: "anthropic",
      modelId: "claude-x",
    });
  });
});
