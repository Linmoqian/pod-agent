/*
 * 聊天域的领域类型;字段保持最小集,后续接真实后端时在此扩展。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

export type ChatRole = "user" | "assistant";

export type SessionStatus = "working" | "ready";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  /** 渲染正文;assistant 侧支持 Markdown(GFM + 代码高亮) */
  content: string;
  /** 展示用时间文案;接入真实后端后改为 ISO 时间戳 */
  time: string;
};

export type ChatSession = {
  id: string;
  title: string;
  status: SessionStatus;
  /** 列表分组标签,如"今天"/"昨天" */
  group: string;
  messages: ChatMessage[];
};
