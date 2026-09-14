// React 技术栈一致性检查
// Created on 2026-09-14
// @author: https://github.com/Linmoqian

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const appRoot = path.resolve(import.meta.dirname, '..');
const packageJsonPath = path.join(appRoot, 'package.json');
const lockfilePath = path.join(appRoot, 'pnpm-lock.yaml');
const sourceRoot = path.join(appRoot, 'src');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const lockfile = fs.readFileSync(lockfilePath, 'utf8');

const errors = [];

// React 与 ReactDOM 必须由同一套运行时版本提供，避免多份 React 上下文。
const reactOverride = packageJson.pnpm?.overrides?.react;
const reactDomOverride = packageJson.pnpm?.overrides?.['react-dom'];
if (!reactOverride || reactOverride !== reactDomOverride) {
  errors.push(
    'package.json 未将 react 与 react-dom 指向同一 pnpm override 版本',
  );
}

for (const packageName of ['react', 'react-dom']) {
  const versions = new Set(
    [
      ...lockfile.matchAll(new RegExp(`^  ${packageName}@([^:\\n]+):$`, 'gm')),
    ].map((match) => match[1].split('(')[0]),
  );
  if (versions.size !== 1 || !versions.has(reactOverride)) {
    errors.push(
      `${packageName} 在 pnpm-lock.yaml 中解析为 ${[...versions].join(', ') || '未找到'}`,
    );
  }
}

// 这些是已选定的替代栈入口。未来库可以继续保留在 package.json，但业务源码不能重新接入第二套入口。
const forbiddenImports = new Map([
  ['antd', 'radix-ui + shadcn 组件模式'],
  ['@tanstack/react-router', 'react-router'],
  ['react-router-dom', 'react-router'],
  ['zustand', 'Redux Toolkit + react-redux'],
  ['echarts', 'recharts'],
  ['echarts-for-react', 'recharts'],
  ['cn', '@/lib/utils 中的 cn'],
]);

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

function importedPackageNames(source) {
  const names = [];
  const importPattern =
    /(?:from\s+|import\s+(?:type\s+)?|import\s*\(\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    names.push(match[1]);
  }
  return names;
}

for (const filePath of collectSourceFiles(sourceRoot)) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const importedName of importedPackageNames(source)) {
    const replacement = forbiddenImports.get(importedName);
    if (replacement) {
      errors.push(
        `${path.relative(appRoot, filePath)} 直接导入 ${importedName}，应使用 ${replacement}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('React 技术栈检查失败:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `React 技术栈检查通过：React/ReactDOM 均锁定为 ${reactOverride}，源码未接入冲突入口。`,
  );
}
