/*
 * 模型提供商注册表:pi-ai Models 集合的应用级单例封装。
 * 内置提供商按常用子集注册;自定义 OpenAI 兼容端点只使用 Rust 刷新的模型目录;
 * 配置签名去重,避免无关状态更新时重建并丢失已刷新的动态模型列表。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import {
  createModels,
  createProvider,
  type Api,
  type Model,
  type MutableModels,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { moonshotaiProvider } from "@earendil-works/pi-ai/providers/moonshotai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import type { CustomProviderConfig } from "../types";

/** 自定义提供商 ID 前缀,与内置提供商命名空间隔离 */
export const CUSTOM_PROVIDER_PREFIX = "custom-";

/** Provider ID 用作运行时注册表与 Keychain 账户名，只允许有限 ASCII 字符。 */
export function isValidProviderId(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(value);
}

/** 自定义端点只允许无凭据、无查询参数的 HTTP(S) 根地址，避免把密钥带进配置。 */
export function isValidCustomProviderUrl(value: string): boolean {
  if (!value.trim() || /\s/.test(value) || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

/** 生成自定义提供商的稳定 ID */
export function generateCustomProviderId(): string {
  return `${CUSTOM_PROVIDER_PREFIX}${crypto.randomUUID()}`;
}

const BUILTIN_FACTORIES = [
  anthropicProvider,
  openaiProvider,
  googleProvider,
  deepseekProvider,
  openrouterProvider,
  moonshotaiProvider,
] as const;

/** 设置面板展示用的内置提供商清单(id 即 pi-ai Provider.id,与工厂一一对应) */
export const BUILTIN_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "openrouter",
  "moonshot",
] as const;

let modelsInstance: MutableModels | null = null;
let lastAppliedCustomSignature = "";

export function getModels(): MutableModels {
  if (!modelsInstance) {
    // API Key 不进入 WebView 的 pi-ai registry；真正请求由 Rust 从 Keychain 注入 Agent。
    modelsInstance = createModels();
    for (const factory of BUILTIN_FACTORIES) {
      modelsInstance.setProvider(factory());
    }
  }
  return modelsInstance;
}

/** OpenAI 兼容端点的模型条目默认值;上下文等限制由端点自行裁剪 */
function openAiCompatibleModel(
  providerId: string,
  baseUrl: string,
  modelId: string,
): Model<"openai-completions"> {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: providerId,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}

function createCustomProvider(config: CustomProviderConfig) {
  return createProvider({
    id: config.id,
    name: config.name,
    baseUrl: config.baseUrl,
    // 运行时请求不在 WebView 发出，Node Agent 会使用 Rust 注入的短生命周期密钥。
    auth: {
      apiKey: {
        name: `${config.name} API Key`,
        resolve: async () => ({ auth: {}, source: "Rust request" }),
      },
    },
    models: [...new Set(config.modelIds ?? (config.modelId ? [config.modelId] : []))]
      .filter(Boolean)
      .map((modelId) => openAiCompatibleModel(config.id, config.baseUrl, modelId)),
    api: openAICompletionsApi(),
  });
}

/** 把 Redux 中的自定义提供商配置同步进 Models 集合;配置未变化时跳过重建 */
export function applyCustomProviders(
  configs: CustomProviderConfig[],
): void {
  const signature = JSON.stringify(configs);
  if (signature === lastAppliedCustomSignature) return;

  const models = getModels();
  for (const provider of models.getProviders()) {
    if (provider.id.startsWith(CUSTOM_PROVIDER_PREFIX)) {
      models.deleteProvider(provider.id);
    }
  }
  for (const config of configs) {
    models.setProvider(createCustomProvider(config));
  }
  lastAppliedCustomSignature = signature;
}

/** 按引用解析运行时 Model 对象;未注册或未刷新到时返回 undefined */
export function resolveModel(
  providerId: string,
  modelId: string,
): Model<Api> | undefined {
  return getModels().getModel(providerId, modelId);
}
