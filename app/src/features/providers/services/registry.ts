/*
 * 模型提供商注册表:pi-ai Models 集合的应用级单例封装。
 * 内置提供商按常用子集注册;自定义 OpenAI 兼容端点支持 /models 动态发现;
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
import { credentialStore } from "./credentials";

/** 自定义提供商 ID 前缀,与内置提供商命名空间隔离 */
export const CUSTOM_PROVIDER_PREFIX = "custom-";

/** 生成自定义提供商的稳定 ID */
export function generateCustomProviderId(): string {
  return `${CUSTOM_PROVIDER_PREFIX}${Date.now().toString(36)}`;
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
    modelsInstance = createModels({ credentials: credentialStore });
    for (const factory of BUILTIN_FACTORIES) {
      modelsInstance.setProvider(factory());
    }
  }
  return modelsInstance;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
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
    // 本地推理服务普遍无鉴权,未存密钥时按已配置的无密钥端点处理
    auth: {
      apiKey: {
        name: `${config.name} API Key`,
        resolve: async ({ credential }) =>
          credential?.key
            ? {
                auth: { apiKey: credential.key },
                source: "stored credential",
              }
            : { auth: {}, source: "keyless" },
      },
    },
    models: [],
    fetchModels: async ({ credential, signal }) => {
      const key = credential?.type === "api_key" ? credential.key : undefined;
      const response = await fetch(joinUrl(config.baseUrl, "models"), {
        signal,
        headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(`拉取模型列表失败: HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { data?: Array<{ id: string }> };
      return (payload.data ?? [])
        .filter((item) => typeof item.id === "string" && item.id)
        .map((item) => openAiCompatibleModel(config.id, config.baseUrl, item.id));
    },
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

/** 刷新指定自定义提供商(缺省为全部)的动态模型列表 */
export async function refreshCustomProviders(
  providerIds?: string[],
): Promise<void> {
  await getModels().refresh({ providers: providerIds });
}

/** 按引用解析运行时 Model 对象;未注册或未刷新到时返回 undefined */
export function resolveModel(
  providerId: string,
  modelId: string,
): Model<Api> | undefined {
  return getModels().getModel(providerId, modelId);
}
