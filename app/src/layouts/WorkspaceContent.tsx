/*
 * 工作区内容区：根据当前视图展示对话、结果、文件预览或开发终端。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import WorkspaceComposer from '../features/workspace/components/WorkspaceComposer';
import WorkspaceFilePreviewPanel from '../features/workspace/components/WorkspaceFilePreview';
import TerminalPanel from '../features/workspace/components/TerminalPanel';
import WorkspaceTimeline from '../features/workspace/components/WorkspaceTimeline';
import YoloResultsPanel from '../features/workspace/components/YoloResultsDialog';
import type { FieldMapping } from '../features/workspace/components/SourceReview';
import type { YoloTask } from '../features/workspace/components/YoloTaskCard';
import type {
  ImportInspection,
  SourceCandidate,
  WorkspaceFilePreview,
  WorkspaceSnapshot,
} from '../features/workspace/types';
import styles from './AppLayout.module.css';

export type WorkspaceView =
  | 'conversation'
  | 'yolo-results'
  | 'file-preview'
  | 'terminal';

export type FilePreviewState = WorkspaceFilePreview & {
  status: 'loading' | 'ready' | 'error';
  error?: string;
};

type WorkspaceContentProps = {
  snapshot: WorkspaceSnapshot;
  activeView: WorkspaceView;
  yoloResultsFocusId?: string;
  yoloTask: YoloTask;
  filePreview: FilePreviewState | null;
  terminalOpen: boolean;
  developerMode: boolean;
  inspection: ImportInspection | null;
  mappingEdits: Record<string, FieldMapping>;
  intent: string;
  busy: boolean;
  canCancel: boolean;
  onSuggestion: (value: string) => void;
  onMappingChange: (sourceId: string, value: FieldMapping) => void;
  onRegister: (
    candidates: SourceCandidate[],
    projectId: string,
    importSessionId: string,
    resolutions: Record<string, string>,
  ) => void;
  onRetry: (content: string) => void;
  onIntentChange: (value: string) => void;
  onChooseData: (directory: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export default function WorkspaceContent({
  snapshot,
  activeView,
  yoloResultsFocusId,
  yoloTask,
  filePreview,
  terminalOpen,
  developerMode,
  inspection,
  mappingEdits,
  intent,
  busy,
  canCancel,
  onSuggestion,
  onMappingChange,
  onRegister,
  onRetry,
  onIntentChange,
  onChooseData,
  onSubmit,
  onCancel,
}: WorkspaceContentProps) {
  return (
    <section className={styles.workspace}>
      {activeView === 'yolo-results' ? (
        <YoloResultsPanel
          photos={yoloTask.photos}
          initialPhotoId={yoloResultsFocusId}
          loadThumbnail={yoloTask.loadThumbnail}
          loadImagePreview={yoloTask.loadImagePreview}
          loadResultPreview={yoloTask.loadResultPreview}
          exportCsv={yoloTask.exportCsv}
        />
      ) : activeView === 'file-preview' && filePreview ? (
        <WorkspaceFilePreviewPanel preview={filePreview} />
      ) : activeView === 'terminal' && terminalOpen ? (
        <TerminalPanel developerMode={developerMode} />
      ) : (
        <>
          <WorkspaceTimeline
            key={snapshot.conversation.id}
            messages={snapshot.messages}
            onSuggestion={onSuggestion}
            inspection={inspection}
            mappingEdits={mappingEdits}
            onMappingChange={onMappingChange}
            onRegister={onRegister}
            onRetry={onRetry}
          />
          <WorkspaceComposer
            intent={intent}
            busy={busy}
            canCancel={canCancel}
            onIntentChange={onIntentChange}
            onChooseData={onChooseData}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </>
      )}
    </section>
  );
}
