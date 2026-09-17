/* 育种台抽屉式布局预览与模块排序编辑器。
 * Created on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Activity,
  FileText,
  FolderTree,
  GripVertical,
  ImageIcon,
  Layers3,
  MonitorCog,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useState, type ReactNode } from 'react';

import {
  WORKBENCH_MODULE_IDS,
  type PanelLayout,
  type WorkbenchModuleDensity,
  type WorkbenchModuleId,
} from '../../../layouts/panelLayout';
import styles from './WorkbenchLayoutEditor.module.css';

type WorkbenchLayoutEditorProps = {
  layout: PanelLayout;
  onLayoutChange: (next: PanelLayout) => void;
  onDraggingChange?: (dragging: boolean) => void;
};

type ModuleCardProps = WorkbenchLayoutEditorProps & {
  id: WorkbenchModuleId;
  overlay?: boolean;
  sortable?: ReturnType<typeof useSortable>;
};

const MODULE_META: Record<
  WorkbenchModuleId,
  { label: string; description: string; icon: ReactNode }
> = {
  imageRecognition: {
    label: '图片识别',
    description: '图片推理与队列进度',
    icon: <ImageIcon size={16} strokeWidth={1.75} />,
  },
  resourceMonitor: {
    label: '资源监视',
    description: 'CPU 与内存使用情况',
    icon: <Activity size={16} strokeWidth={1.75} />,
  },
  taskPanel: {
    label: '任务面板',
    description: '任务计划与文件树',
    icon: <Layers3 size={16} strokeWidth={1.75} />,
  },
};

function isWorkbenchModuleId(value: unknown): value is WorkbenchModuleId {
  return (
    typeof value === 'string' &&
    WORKBENCH_MODULE_IDS.includes(value as WorkbenchModuleId)
  );
}

function moduleDensity(layout: PanelLayout, id: WorkbenchModuleId) {
  if (id === 'imageRecognition') return layout.imageRecognitionDensity;
  if (id === 'resourceMonitor') return layout.resourceMonitorDensity;
  return undefined;
}

function moduleVisible(layout: PanelLayout, id: WorkbenchModuleId) {
  if (id === 'imageRecognition') return layout.showImageRecognition;
  if (id === 'resourceMonitor') return layout.showResourceMonitor;
  return true;
}

function updateDensity(
  layout: PanelLayout,
  id: WorkbenchModuleId,
  density: WorkbenchModuleDensity,
) {
  if (id === 'imageRecognition') {
    return { ...layout, imageRecognitionDensity: density };
  }
  if (id === 'resourceMonitor') {
    return { ...layout, resourceMonitorDensity: density };
  }
  return layout;
}

function updateVisibility(
  layout: PanelLayout,
  id: WorkbenchModuleId,
  visible: boolean,
) {
  if (id === 'imageRecognition') {
    return { ...layout, showImageRecognition: visible };
  }
  if (id === 'resourceMonitor') {
    return { ...layout, showResourceMonitor: visible };
  }
  return layout;
}

function DensitySwitch({
  id,
  density,
  onChange,
}: {
  id: WorkbenchModuleId;
  density: WorkbenchModuleDensity;
  onChange: (density: WorkbenchModuleDensity) => void;
}) {
  const label = MODULE_META[id].label;
  return (
    <div
      className={styles.densitySwitch}
      role="group"
      aria-label={`${label}样式`}
    >
      {(['simple', 'complex'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={density === value}
          onClick={() => onChange(value)}
        >
          {value === 'simple' ? '简易' : '完整'}
        </button>
      ))}
    </div>
  );
}

function VisibilitySwitch({
  id,
  checked,
  onChange,
  label,
}: {
  id: WorkbenchModuleId;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      className={styles.visibilitySwitch}
      data-checked={checked}
      aria-checked={checked}
      aria-label={label ?? MODULE_META[id].label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function PreviewContent({
  id,
  density,
  visible,
  showFileTree,
}: {
  id: WorkbenchModuleId;
  density?: WorkbenchModuleDensity;
  visible: boolean;
  showFileTree: boolean;
}) {
  if (!visible) {
    return <div className={styles.hiddenPreview}>已隐藏，仍保留在当前顺序中</div>;
  }

  if (id === 'imageRecognition') {
    return (
      <div className={styles.imagePreview} data-density={density}>
        {density === 'complex' ? (
          <>
            <div className={styles.imageStack}>
              <span><ImageIcon size={17} /></span>
              <span><ImageIcon size={17} /></span>
            </div>
            <div className={styles.previewProgress}>
              <span />
            </div>
            <small>待处理 12 · 已完成 8</small>
          </>
        ) : (
          <div className={styles.summaryRow}>
            <span><MonitorCog size={14} />队列运行中</span>
            <strong>20 张</strong>
          </div>
        )}
      </div>
    );
  }

  if (id === 'resourceMonitor') {
    return (
      <div className={styles.resourcePreview} data-density={density}>
        <div><span>CPU</span><strong>32%</strong></div>
        <div><span>内存</span><strong>{density === 'complex' ? '48% · 7.7 GB' : '48%'}</strong></div>
        {density === 'complex' && (
          <div className={styles.resourceBars} aria-hidden>
            <span /><span />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.taskPreview}>
      <div className={styles.taskPreviewTitle}>
        <span><FileText size={14} />任务</span>
        <strong>等待任务</strong>
      </div>
      <div className={styles.taskPreviewTabs}>
        <span>任务</span>
        {showFileTree && <span><FolderTree size={12} />文件树</span>}
      </div>
      <small>提出问题后，任务计划会出现在这里</small>
    </div>
  );
}

function ModuleCard({
  layout,
  onLayoutChange,
  id,
  overlay = false,
  sortable,
}: ModuleCardProps) {
  const meta = MODULE_META[id];
  const visible = moduleVisible(layout, id);
  const density = moduleDensity(layout, id);

  return (
    <article
      className={`${styles.moduleCard} ${overlay ? styles.overlayCard : ''}`}
      data-hidden={!visible}
    >
      <div className={styles.moduleHeader}>
        {!overlay && (
          <button
            type="button"
            className={styles.dragHandle}
            aria-label={`拖动${meta.label}模块`}
            {...sortable?.attributes}
            {...sortable?.listeners}
          >
            <GripVertical size={15} aria-hidden />
          </button>
        )}
        <span className={styles.moduleIcon} aria-hidden>{meta.icon}</span>
        <span className={styles.moduleCopy}>
          <strong>{meta.label}</strong>
          <small>{meta.description}</small>
        </span>
        {!overlay && id !== 'taskPanel' && (
          <VisibilitySwitch
            id={id}
            checked={visible}
            onChange={(checked) => onLayoutChange(updateVisibility(layout, id, checked))}
          />
        )}
      </div>
      <PreviewContent
        id={id}
        density={density}
        visible={visible}
        showFileTree={layout.showFileTree}
      />
      {!overlay && id !== 'taskPanel' && density && (
        <DensitySwitch
          id={id}
          density={density}
          onChange={(nextDensity) => onLayoutChange(updateDensity(layout, id, nextDensity))}
        />
      )}
      {!overlay && id === 'taskPanel' && (
        <div className={styles.taskOption}>
          <FolderTree size={14} aria-hidden />
          <span>文件树</span>
          <VisibilitySwitch
            id="taskPanel"
            checked={layout.showFileTree}
            label="文件树"
            onChange={(checked) => onLayoutChange({ ...layout, showFileTree: checked })}
          />
        </div>
      )}
    </article>
  );
}

export default function WorkbenchLayoutEditor({
  layout,
  onLayoutChange,
  onDraggingChange,
}: WorkbenchLayoutEditorProps) {
  const [activeId, setActiveId] = useState<WorkbenchModuleId | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeModule = activeId && isWorkbenchModuleId(activeId) ? activeId : null;

  const handleDragStart = ({ active }: DragStartEvent) => {
    if (!isWorkbenchModuleId(active.id)) return;
    setActiveId(active.id);
    onDraggingChange?.(true);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const activeModuleId = isWorkbenchModuleId(active.id) ? active.id : null;
    const overModuleId = over && isWorkbenchModuleId(over.id) ? over.id : null;
    setActiveId(null);
    onDraggingChange?.(false);
    if (!activeModuleId || !overModuleId || activeModuleId === overModuleId) return;
    const oldIndex = layout.workbenchOrder.indexOf(activeModuleId);
    const newIndex = layout.workbenchOrder.indexOf(overModuleId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    onLayoutChange({
      ...layout,
      workbenchOrder: arrayMove(layout.workbenchOrder, oldIndex, newIndex),
    });
  };

  const handleDragCancel = () => {
    setActiveId(null);
    onDraggingChange?.(false);
  };

  return (
    <div className={styles.editor}>
      <div className={styles.editorHeading}>
        <div>
          <strong>育种台预览</strong>
          <span>拖动模块调整顺序，卡片内可切换显示密度。</span>
        </div>
        <Activity size={17} aria-hidden />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <aside className={styles.drawer} aria-label="育种台预览抽屉">
          <div className={styles.drawerHeader}>
            <strong><Layers3 size={16} aria-hidden />育种台</strong>
            <span>实时布局</span>
          </div>
          <div className={styles.drawerTabs} aria-hidden>
            <span data-active="true">任务</span>
            {layout.showFileTree && <span>文件树</span>}
          </div>
          <div className={styles.moduleList}>
            <SortableContext
              items={layout.workbenchOrder}
              strategy={verticalListSortingStrategy}
            >
              {layout.workbenchOrder.map((id) => (
                <SortableModuleCard
                  key={id}
                  id={id}
                  layout={layout}
                  onLayoutChange={onLayoutChange}
                  activeId={activeId}
                />
              ))}
            </SortableContext>
          </div>
        </aside>
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {activeModule ? (
              <ModuleCard
                id={activeModule}
                layout={layout}
                onLayoutChange={onLayoutChange}
                overlay
              />
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </div>
  );
}

function SortableModuleCard({
  activeId,
  ...props
}: ModuleCardProps & { activeId: WorkbenchModuleId | null }) {
  const sortable = useSortable({ id: props.id });
  const meta = MODULE_META[props.id];
  const visible = moduleVisible(props.layout, props.id);
  const isDragging = activeId === props.id;
  const style = {
    transform: isDragging ? undefined : CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      className={styles.sortableSlot}
      data-hidden={!visible}
      data-dragging={isDragging ? 'true' : undefined}
      style={style}
    >
      {isDragging ? (
        <div className={styles.placeholderCopy}>
          <GripVertical size={15} aria-hidden />
          <span>{meta.label}放置位置</span>
        </div>
      ) : (
        <ModuleCard {...props} overlay={false} sortable={sortable} />
      )}
    </div>
  );
}
