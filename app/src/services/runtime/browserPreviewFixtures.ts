/* 浏览器预览和调试共用的工作区文件树示例。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import type {
  WorkspaceFileNode,
  WorkspaceFilePreview,
  WorkspaceSnapshot,
} from '../../features/workspace/types';

export function createBrowserPreviewSnapshot(): WorkspaceSnapshot {
  const now = new Date().toISOString();
  return {
    conversation: {
      id: 'browser-preview',
      projectId: null,
      title: '浏览器预览',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    project: null,
    datasets: [],
    artifacts: [],
    taskPlans: [],
    workflowRuns: [],
    messages: [],
  };
}
export function createBrowserPreviewFileTree(): WorkspaceFileNode {
  return {
    name: 'pod-agent',
    relativePath: '',
    directory: true,
    children: [
      {
        name: 'app',
        relativePath: 'app',
        directory: true,
        children: [
          {
            name: 'src',
            relativePath: 'app/src',
            directory: true,
            children: [
              {
                name: 'App.tsx',
                relativePath: 'app/src/App.tsx',
                directory: false,
                children: [],
              },
              {
                name: 'main.tsx',
                relativePath: 'app/src/main.tsx',
                directory: false,
                children: [],
              },
            ],
          },
          {
            name: 'src-tauri',
            relativePath: 'app/src-tauri',
            directory: true,
            children: [
              {
                name: 'src',
                relativePath: 'app/src-tauri/src',
                directory: true,
                children: [
                  {
                    name: 'main.rs',
                    relativePath: 'app/src-tauri/src/main.rs',
                    directory: false,
                    children: [],
                  },
                ],
              },
            ],
          },
          {
            name: 'README.md',
            relativePath: 'app/README.md',
            directory: false,
            children: [],
          },
        ],
      },
      {
        name: 'docs',
        relativePath: 'docs',
        directory: true,
        children: [
          {
            name: 'README.md',
            relativePath: 'docs/README.md',
            directory: false,
            children: [],
          },
        ],
      },
      {
        name: 'tests',
        relativePath: 'tests',
        directory: true,
        children: [
          {
            name: 'workspace.test.ts',
            relativePath: 'tests/workspace.test.ts',
            directory: false,
            children: [],
          },
        ],
      },
      {
        name: 'AGENTS.md',
        relativePath: 'AGENTS.md',
        directory: false,
        children: [],
      },
      {
        name: 'README.md',
        relativePath: 'README.md',
        directory: false,
        children: [],
      },
      {
        name: 'environment.yml',
        relativePath: 'environment.yml',
        directory: false,
        children: [],
      },
    ],
  };
}

const BROWSER_PREVIEW_FILES: Record<
  string,
  Omit<WorkspaceFilePreview, 'name' | 'relativePath'>
> = {
  'app/README.md': {
    kind: 'markdown',
    language: 'markdown',
    content:
      '# pod-agent\n\n这是工作区文件树的浏览器预览。\n\n- 点击左侧 Markdown 文件查看内容\n- 点击代码文件查看只读源码\n',
  },
  'app/src/App.tsx': {
    kind: 'code',
    language: 'typescript',
    content: [
      "import AppRoutes from './routes/AppRoutes';",
      '',
      'export default function App() {',
      '  return <AppRoutes />;',
      '}',
    ].join('\n'),
  },
  'app/src/main.tsx': {
    kind: 'code',
    language: 'typescript',
    content: [
      "import React from 'react';",
      "import ReactDOM from 'react-dom/client';",
      "import App from './App';",
      '',
      "ReactDOM.createRoot(document.getElementById('root')!).render(",
      '  <React.StrictMode>',
      '    <App />',
      '  </React.StrictMode>,',
      ');',
    ].join('\n'),
  },
  'app/src-tauri/src/main.rs': {
    kind: 'code',
    language: 'rust',
    content: [
      '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows"]',
      '',
      'fn main() {',
      '    pod_agent_lib::run();',
      '}',
    ].join('\n'),
  },
  'docs/README.md': {
    kind: 'markdown',
    language: 'markdown',
    content: '# 文档\n\n这里展示工作区内可读的 Markdown 文件。\n',
  },
  'tests/workspace.test.ts': {
    kind: 'code',
    language: 'typescript',
    content: [
      "import { describe, expect, it } from 'vitest';",
      '',
      "describe('workspace', () => {",
      "  it('renders a file preview', () => {",
      '    expect(true).toBe(true);',
      '  });',
      '});',
    ].join('\n'),
  },
};

export function createBrowserPreviewFile(
  relativePath: string,
): WorkspaceFilePreview {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const name = normalizedPath.split('/').pop() || normalizedPath;
  return {
    name,
    relativePath: normalizedPath,
    ...(BROWSER_PREVIEW_FILES[normalizedPath] || {
      kind: 'code' as const,
      language: 'plaintext',
      content: '// 浏览器预览中没有缓存该文件内容。',
    }),
  };
}
