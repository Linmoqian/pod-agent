/*
 * Pod Agent 工具注册表：具体工具写在 tools/ 目录，在此登记后 agent.ts 直接取用。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { readFileTool } from './tools/read-file.ts';
import { runCommandTool } from './tools/run-command.ts';
import { writeFileTool } from './tools/write-file.ts';
import { yoloDetectTool } from './tools/yolo.ts';

export const tools = [
  readFileTool,
  writeFileTool,
  runCommandTool,
  yoloDetectTool,
];
