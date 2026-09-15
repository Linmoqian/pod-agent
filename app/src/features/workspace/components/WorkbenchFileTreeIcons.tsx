/*
 * 工作区文件树的文件类型图标映射，保持接近 VS Code 的识别习惯。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import {
  File,
  FileArchive,
  FileCode2,
  FileCog,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Package,
  Terminal,
  type LucideIcon,
} from 'lucide-react';

import type { WorkspaceFileNode } from '../types';
import styles from './WorkbenchPanel.module.css';

type FileKind =
  | 'archive'
  | 'code'
  | 'config'
  | 'data'
  | 'document'
  | 'generic'
  | 'image'
  | 'json'
  | 'package'
  | 'script';

const FILE_ICONS: Record<FileKind, LucideIcon> = {
  archive: FileArchive,
  code: FileCode2,
  config: FileCog,
  data: FileSpreadsheet,
  document: FileText,
  generic: File,
  image: FileImage,
  json: FileJson,
  package: Package,
  script: Terminal,
};

const FILE_NAME_KINDS: Record<string, FileKind> = {
  'agents.md': 'document',
  'cargo.lock': 'package',
  'cargo.toml': 'config',
  dockerfile: 'config',
  'environment.yaml': 'config',
  'environment.yml': 'config',
  'package-lock.json': 'package',
  'package.json': 'package',
  'pnpm-lock.yaml': 'package',
  'readme.md': 'document',
  'tailwind.config.ts': 'config',
  'tsconfig.json': 'config',
  'vite.config.ts': 'config',
  'yarn.lock': 'package',
};

const FILE_EXTENSION_KINDS: Record<string, FileKind> = {
  '.7z': 'archive',
  '.bash': 'script',
  '.bmp': 'image',
  '.c': 'code',
  '.cjs': 'code',
  '.cpp': 'code',
  '.css': 'code',
  '.cts': 'code',
  '.cxx': 'code',
  '.csv': 'data',
  '.doc': 'document',
  '.docx': 'document',
  '.fish': 'script',
  '.gif': 'image',
  '.go': 'code',
  '.gz': 'archive',
  '.h': 'code',
  '.hh': 'code',
  '.hpp': 'code',
  '.html': 'code',
  '.ico': 'image',
  '.ini': 'config',
  '.java': 'code',
  '.jpeg': 'image',
  '.jpg': 'image',
  '.js': 'code',
  '.jsx': 'code',
  '.json': 'json',
  '.kt': 'code',
  '.kts': 'code',
  '.lock': 'package',
  '.markdown': 'document',
  '.md': 'document',
  '.mjs': 'code',
  '.mts': 'code',
  '.pdf': 'document',
  '.php': 'code',
  '.png': 'image',
  '.py': 'code',
  '.rar': 'archive',
  '.rb': 'code',
  '.rs': 'code',
  '.rst': 'document',
  '.scss': 'code',
  '.sh': 'script',
  '.sql': 'code',
  '.svg': 'image',
  '.svelte': 'code',
  '.swift': 'code',
  '.tar': 'archive',
  '.toml': 'config',
  '.ts': 'code',
  '.tsv': 'data',
  '.tsx': 'code',
  '.txt': 'document',
  '.vue': 'code',
  '.webp': 'image',
  '.xls': 'data',
  '.xlsx': 'data',
  '.xml': 'config',
  '.yaml': 'config',
  '.yml': 'config',
  '.zip': 'archive',
  '.zsh': 'script',
};

function getFileKind(name: string): FileKind {
  const normalizedName = name.toLowerCase();
  const namedKind = FILE_NAME_KINDS[normalizedName];
  if (namedKind) return namedKind;

  const extensionStart = normalizedName.lastIndexOf('.');
  const extension =
    extensionStart >= 0 ? normalizedName.slice(extensionStart) : '';
  return FILE_EXTENSION_KINDS[extension] || 'generic';
}

export type WorkspacePreviewKind = 'markdown' | 'code';

const PREVIEW_CODE_KINDS = new Set<FileKind>([
  'code',
  'config',
  'json',
  'package',
  'script',
]);

export function getFilePreviewKind(name: string): WorkspacePreviewKind | null {
  const normalizedName = name.toLowerCase();
  if (normalizedName.endsWith('.md') || normalizedName.endsWith('.markdown')) {
    return 'markdown';
  }
  return PREVIEW_CODE_KINDS.has(getFileKind(name)) ? 'code' : null;
}

export function TreeNodeIcon({ node }: { node: WorkspaceFileNode }) {
  if (node.directory) {
    const Icon = node.children.length ? FolderOpen : Folder;
    return (
      <span className={styles.treeIcon} data-kind="folder" aria-hidden="true">
        <Icon size={15} strokeWidth={1.8} />
      </span>
    );
  }

  const kind = getFileKind(node.name);
  const Icon = FILE_ICONS[kind];
  return (
    <span className={styles.treeIcon} data-kind={kind} aria-hidden="true">
      <Icon size={15} strokeWidth={1.8} />
    </span>
  );
}
