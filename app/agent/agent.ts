/*
 * lian 受控计划进程：只理解意图并返回结构化建议，不持有文件、命令或数据库工具。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { createInterface } from "node:readline";

import { Agent } from "@earendil-works/pi-agent-core";
import { contentText } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

type PlanRequest = {
  requestId: string;
  type: "plan";
  intent: string;
  dataset: {
    id: string;
    name: string;
    schema: unknown;
    qualityStatus: string;
  };
};

const provider = process.env.MODEL_PROVIDER;
const modelId = process.env.MODEL_ID;
const models = builtinModels();
const model = provider && modelId ? models.getModel(provider, modelId) : undefined;

process.stdout.write(`${JSON.stringify({
  type: "handshake",
  ok: Boolean(model),
  model: model ? `${provider}/${modelId}` : null,
})}\n`);

if (!model) {
  process.stderr.write("MODEL_PROVIDER 或 MODEL_ID 未配置，计划器不可用\n");
}

const input = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of input) {
  let request: PlanRequest | undefined;
  try {
    request = JSON.parse(line) as PlanRequest;
    if (request.type !== "plan" || !model) {
      throw new Error("计划请求无效或模型不可用");
    }
    let text = "";
    const agent = new Agent({
      initialState: {
        systemPrompt: "你是 lian@育种台的受控计划器。只输出 JSON 对象，字段为 title、traitId、summary。traitId 必须来自 Dataset schema.traits；不调用工具，不访问文件，不作材料淘汰结论。",
        model,
        tools: [],
      },
      streamFn: models.streamSimple.bind(models),
    });
    agent.subscribe((event) => {
      if (
        event.type === "message_update"
        && event.assistantMessageEvent.type === "text_delta"
      ) {
        text += event.assistantMessageEvent.delta;
      }
    });
    await agent.prompt(JSON.stringify({
      intent: request.intent,
      dataset: request.dataset,
    }));
    const lastMessage = agent.state.messages.at(-1);
    if (!text && lastMessage?.role === "assistant") {
      text = contentText(lastMessage.content);
    }
    process.stdout.write(`${JSON.stringify({
      type: "plan.result",
      requestId: request.requestId,
      ok: true,
      model: `${provider}/${modelId}`,
      proposal: text,
    })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      type: "plan.result",
      requestId: request?.requestId ?? null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
  }
}
