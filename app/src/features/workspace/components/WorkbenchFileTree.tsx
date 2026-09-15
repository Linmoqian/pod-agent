/*
 * 育种台的只读工作区文件树，只展示名称和层级。
 * Created on 2026-09-15
 * @author: https://github.com/Linmoqian
 */

import { ChevronRight } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';

import {
  createBrowserPreviewFileTree,
  isTauriRuntime,
  workspaceApi,
} from '../../../services/workspace';
import type { WorkspaceFileNode } from '../types';
import styles from './WorkbenchPanel.module.css';
import { TreeNodeIcon } from './WorkbenchFileTreeIcons';

function TreeBranch({
  node,
  depth = 0,
}: {
  node: WorkspaceFileNode;
  depth?: number;
}) {
  const folder = node.directory;
  return (
    <li
      className={styles.treeItem}
      style={{ '--tree-depth': depth } as CSSProperties}
    >
      <div className={styles.treeLabel} data-folder={folder || undefined}>
        {folder ? (
          <ChevronRight size={14} aria-hidden />
        ) : (
          <span className={styles.treeSpacer} />
        )}
        <TreeNodeIcon node={node} />
        <span>{node.name}</span>
      </div>
      {folder && (
        <ul className={styles.tree}>
          {node.children.length ? (
            node.children.map((child) => (
              <TreeBranch key={child.name} node={child} depth={depth + 1} />
            ))
          ) : (
            <li
              className={styles.treeEmpty}
              style={{ '--tree-depth': depth + 1 } as CSSProperties}
            >
              暂无项目
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export default function WorkbenchFileTree() {
  const [tree, setTree] = useState<WorkspaceFileNode | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!isTauriRuntime()) {
      setTree(createBrowserPreviewFileTree());
      return () => {
        active = false;
      };
    }
    workspaceApi
      .listWorkspaceFiles()
      .then((result) => active && setTree(result))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className={styles.empty}>工作区文件暂时不可读取</p>;
  if (!tree) return <p className={styles.empty}>正在列出工作区文件</p>;
  return (
    <ul className={styles.tree}>
      <TreeBranch node={tree} />
    </ul>
  );
}
