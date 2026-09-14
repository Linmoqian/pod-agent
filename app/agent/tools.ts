/*
 * lian 讨论模式视觉工具；计划器不加载工具。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { listYoloModelsTool, yoloDetectTool } from './tools/yolo.ts';
import { checkPythonEnvironmentTool } from './tools/python-environment.ts';

export const discussionTools = [checkPythonEnvironmentTool, listYoloModelsTool, yoloDetectTool];
