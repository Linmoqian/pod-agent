/*
 * 本地种子数据:在真实会话服务接入前驱动侧栏与对话视图。
 * 时间文案为固定占位,避免前端演示依赖系统时钟。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import type { ChatSession } from "../types";

export const PLACEHOLDER_REPLY =
  "本地占位回复:对话与 Agent 后端链路尚未接入,当前仅验证前端布局与渲染管线。";

export const MOCK_SESSIONS: ChatSession[] = [
  {
    id: "session-soybean-trait",
    title: "大豆品种性状咨询",
    status: "ready",
    group: "今天",
    messages: [
      {
        id: "msg-trait-q",
        role: "user",
        content: "帮我对比一下中黄 13 和合丰 50 的关键性状。",
        time: "14:20",
      },
      {
        id: "msg-trait-a",
        role: "assistant",
        content: `### 大豆品种性状对比

两个品种的核心差异如下:

| 性状 | 中黄 13 | 合丰 50 |
| --- | --- | --- |
| 蛋白含量 | 高蛋白 | 中等 |
| 产量 | 稳产 | 适应性强 |

\`\`\`python
# 示例:查询品种性状
def query_trait(variety: str, trait: str) -> dict: ...
\`\`\`

如需导出为育种台账,可以在输入框继续描述需求。`,
        time: "14:20",
      },
    ],
  },
  {
    id: "session-field-plan",
    title: "田间管理计划排期",
    status: "working",
    group: "昨天",
    messages: [
      {
        id: "msg-field-q",
        role: "user",
        content: "本周试验田的追肥与灌溉如何安排?",
        time: "昨天",
      },
      {
        id: "msg-field-a",
        role: "assistant",
        content:
          "已根据生育期给出初步排期建议:开花期前后追肥一次,结荚期保持土壤持水量 70% 左右;详细方案待数据模块接入后生成。",
        time: "昨天",
      },
    ],
  },
];
