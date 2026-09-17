// SSH 连接列表与拖动排序。
// Created on 2026-09-17
// @author: https://github.com/Linmoqian

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
import { Server } from 'lucide-react';
import { useState } from 'react';

import type { SshObject } from './sshTypes';
import SshObjectRow, { type SshObjectRowProps } from './SshObjectRow';
import styles from './TerminalPanel.module.css';

type SshObjectListProps = {
  objects: SshObject[];
  onSelect: (object: SshObject) => void;
  onConnect: (object: SshObject) => void;
  onPing: (object: SshObject) => void;
  onDelete: (object: SshObject) => void;
  onReorder: (objects: SshObject[]) => void;
};

export default function SshObjectList({
  objects,
  onSelect,
  onConnect,
  onPing,
  onDelete,
  onReorder,
}: SshObjectListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!objects.length) {
    return (
      <div className={styles.sshObjectEmpty}>
        <Server size={18} aria-hidden />
        <span>暂无连接</span>
      </div>
    );
  }

  const activeObject = objects.find((object) => object.id === activeId) ?? null;

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = objects.findIndex((object) => object.id === active.id);
    const newIndex = objects.findIndex((object) => object.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(objects, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={objects.map((object) => object.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={styles.sshObjectList} role="list">
          {objects.map((object) => (
            <SortableSshObject
              key={object.id}
              object={object}
              onSelect={onSelect}
              onConnect={onConnect}
              onPing={onPing}
              onDelete={onDelete}
              dragging={object.id === activeId}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeObject ? <SshObjectRow object={activeObject} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableSshObject(
  props: Omit<SshObjectRowProps, 'sortable' | 'overlay'>,
) {
  const sortable = useSortable({ id: props.object.id });
  return <SshObjectRow {...props} sortable={sortable} />;
}
