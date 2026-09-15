/*
 * Monaco 编辑器本地化配置:绕开 @monaco-editor/react 默认的 jsdelivr CDN 加载,
 * 使 Tauri 桌面端在离线环境下也可用。
 * 使用方式:在挂载 <Editor /> 前于入口处 import 一次本模块即可。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoian
 */

import { loader } from '@monaco-editor/react';
// 仅引入核心 API,不携带全部语言包,保持主包轻量。
import * as monaco from 'monaco-editor/editor/editor.api.js';
// worker 经 Vite ?worker 导入,编译为独立 chunk,主包体积不受影响。
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

// 只注册文件树当前支持的语言,让预览保持离线可用并获得接近 VS Code 的语法着色。
import 'monaco-editor/language/css/monaco.contribution.js';
import 'monaco-editor/language/html/monaco.contribution.js';
import 'monaco-editor/language/json/monaco.contribution.js';
import 'monaco-editor/language/typescript/monaco.contribution.js';
import 'monaco-editor/languages/definitions/cpp/register.js';
import 'monaco-editor/languages/definitions/dockerfile/register.js';
import 'monaco-editor/languages/definitions/go/register.js';
import 'monaco-editor/languages/definitions/java/register.js';
import 'monaco-editor/languages/definitions/markdown/register.js';
import 'monaco-editor/languages/definitions/python/register.js';
import 'monaco-editor/languages/definitions/rust/register.js';
import 'monaco-editor/languages/definitions/scss/register.js';
import 'monaco-editor/languages/definitions/shell/register.js';
import 'monaco-editor/languages/definitions/sql/register.js';
import 'monaco-editor/languages/definitions/swift/register.js';
import 'monaco-editor/languages/definitions/xml/register.js';
import 'monaco-editor/languages/definitions/yaml/register.js';

// 指定 worker 解析器;语言 contribution 与编辑器共用该 worker。
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// 让 @monaco-editor/react 的 loader 使用本地 monaco 实例,而非 CDN。
loader.config({ monaco });
