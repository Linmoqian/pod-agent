/* 模型设置页编排：列表优先，编辑时进入独立详情页。
 * Created on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

import { AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';

import useProviderSettings from '../hooks/useProviderSettings';
import ModelProviderEditor, { type ModelEditorMode } from './ModelProviderEditor';
import ModelProviderOverview from './ModelProviderOverview';

type EditorState = {
  kind: ModelEditorMode;
  providerId?: string;
};

export default function ModelProviderSettings() {
  const {
    rows,
    customProviders,
    currentModel,
    modelGroups,
    saveKey,
    clearKey,
    saveCustomProvider,
    addYolo,
    removeCustom,
    removeYolo,
    customYoloModels,
    refreshCustomModels,
    selectModel,
  } = useProviderSettings();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const customById = new Map(customProviders.map((provider) => [provider.id, provider]));

  const refresh = async (providerId: string) => {
    setRefreshingId(providerId);
    const error = await refreshCustomModels(providerId);
    setRefreshingId(null);
    if (error) toast.error(`刷新失败：${error}`);
    else toast.success('模型目录已刷新');
  };

  const remove = async (providerId: string) => {
    const provider = customById.get(providerId);
    const removed = await removeCustom(providerId);
    if (!removed) return;
    if (editor?.kind === 'custom-provider' && editor.providerId === providerId) {
      setEditor(null);
    }
    if (provider) toast.success(`已删除 ${provider.name}`);
  };

  const editorKey = editor
    ? `${editor.kind}-${editor.providerId ?? 'new'}`
    : 'overview';
  const editorProvider = editor?.providerId
    ? rows.find((row) => row.id === editor.providerId)
    : undefined;
  const editorConfig = editor?.kind === 'custom-provider' && editor.providerId
    ? customById.get(editor.providerId)
    : undefined;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {editor ? (
        <ModelProviderEditor
          key={editorKey}
          mode={editor.kind}
          provider={editorProvider}
          config={editorConfig}
          onBack={() => setEditor(null)}
          onSaveCustom={saveCustomProvider}
          onSaveKey={saveKey}
          onClearKey={clearKey}
          onSaveYolo={addYolo}
          onRemove={editor.kind === 'custom-provider' && editor.providerId
            ? () => remove(editor.providerId as string)
            : undefined}
        />
      ) : (
        <ModelProviderOverview
          key={editorKey}
          rows={rows}
          customProviders={customProviders}
          customYoloModels={customYoloModels}
          currentModel={currentModel}
          modelGroups={modelGroups}
          onAdd={() => setEditor({ kind: 'new-provider' })}
          onOpen={(providerId, custom) => setEditor({
            kind: custom ? 'custom-provider' : 'builtin-provider',
            providerId,
          })}
          onRefresh={(providerId) => void refresh(providerId)}
          onRemove={(providerId) => void remove(providerId)}
          onAddYolo={() => setEditor({ kind: 'yolo' })}
          onRemoveYolo={removeYolo}
          refreshingId={refreshingId}
          onChangeModel={(value) => {
            if (!value) {
              selectModel(null);
              return;
            }
            const separator = value.indexOf('/');
            if (separator <= 0 || separator === value.length - 1) {
              selectModel(null);
              return;
            }
            selectModel({
              providerId: value.slice(0, separator),
              modelId: value.slice(separator + 1),
            });
          }}
        />
      )}
    </AnimatePresence>
  );
}
