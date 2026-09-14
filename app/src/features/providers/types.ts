/*
 * 模型提供商域的领域类型:仅存放可序列化配置,运行时 Model 对象由 registry 解析。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

/** 自定义 OpenAI 兼容提供商配置(如 Ollama、vLLM、LM Studio) */
export type CustomProviderConfig = {
  /** 稳定 ID,固定以 custom- 前缀开头,与内置提供商命名空间隔离 */
  id: string;
  /** 展示名 */
  name: string;
  /** OpenAI 兼容根地址,如 http://localhost:11434/v1 */
  baseUrl: string;
  /** 直接添加的 LLM 名称;未设置时仍从端点动态发现模型 */
  modelId?: string;
};

/** 用户添加的本地 YOLO 配置;权重由桌面端推理服务在执行时解析。 */
export type CustomYoloModelConfig = {
  id: string;
  name: string;
  weightsPath: string;
};

/** 当前选中的模型引用;Redux 中不保存 Model 对象,发送时按引用查注册表 */
export type ModelSelection = {
  providerId: string;
  modelId: string;
};
