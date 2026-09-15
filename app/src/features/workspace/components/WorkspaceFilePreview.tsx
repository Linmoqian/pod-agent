/*
 * 工作区文件只读预览面板，使用 Monaco 提供接近 VS Code 的代码浏览体验。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import Editor from '@monaco-editor/react';
import { FileCode2, FileText, LoaderCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import '../../../utils/monaco';
import type { WorkspaceFilePreview } from '../types';
import styles from './WorkspaceFilePreview.module.css';

type FilePreviewState = WorkspaceFilePreview & {
  status: 'loading' | 'ready' | 'error';
  error?: string;
};

function useEditorTheme() {
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' &&
    document.documentElement.dataset.theme === 'dark'
      ? 'vs-dark'
      : 'vs',
  );

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => {
      setTheme(root.dataset.theme === 'dark' ? 'vs-dark' : 'vs');
    };
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

function PreviewState({ children }: { children: ReactNode }) {
  return <div className={styles.state}>{children}</div>;
}

export default function WorkspaceFilePreviewPanel({
  preview,
}: {
  preview: FilePreviewState;
}) {
  const theme = useEditorTheme();
  const Icon = preview.kind === 'markdown' ? FileText : FileCode2;

  return (
    <section className={styles.panel} aria-label={`文件预览：${preview.name}`}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.fileIcon} data-kind={preview.kind}>
            <Icon size={16} strokeWidth={1.8} aria-hidden />
          </span>
          <div className={styles.identityText}>
            <strong>{preview.name}</strong>
            <small title={preview.relativePath}>{preview.relativePath}</small>
          </div>
        </div>
        <div className={styles.meta}>
          {preview.status === 'loading' && (
            <span className={styles.status}>
              <LoaderCircle className={styles.spin} size={13} aria-hidden />
              读取中
            </span>
          )}
          {preview.status === 'error' && (
            <span className={styles.status} data-status="error">
              {preview.error || '文件读取失败'}
            </span>
          )}
          {preview.status === 'ready' && (
            <>
              <span className={styles.readOnly}>只读</span>
              <span>{preview.language}</span>
            </>
          )}
        </div>
      </header>
      <div className={styles.editor}>
        {preview.status === 'loading' && (
          <PreviewState>
            <LoaderCircle className={styles.spin} size={20} aria-hidden />
            <span>正在读取文件</span>
          </PreviewState>
        )}
        {preview.status === 'error' && (
          <PreviewState>
            <span>{preview.error || '文件读取失败，请稍后重试。'}</span>
          </PreviewState>
        )}
        {preview.status === 'ready' && (
          <Editor
            height="100%"
            language={preview.language}
            theme={theme}
            value={preview.content}
            loading={
              <PreviewState>
                <LoaderCircle className={styles.spin} size={20} aria-hidden />
                <span>正在加载编辑器</span>
              </PreviewState>
            }
            options={{
              automaticLayout: true,
              contextmenu: false,
              domReadOnly: true,
              folding: true,
              fontSize: 13,
              lineHeight: 22,
              lineNumbers: 'on',
              minimap: { enabled: false },
              overviewRulerLanes: 0,
              padding: { top: 18, bottom: 24 },
              readOnly: true,
              renderLineHighlight: 'line',
              scrollBeyondLastLine: false,
              scrollbar: {
                horizontalScrollbarSize: 10,
                verticalScrollbarSize: 10,
              },
              wordWrap: 'off',
            }}
          />
        )}
      </div>
    </section>
  );
}
