/* 育种台任务对象模型与图片推理任务适配器。
 * Created on 2026-09-15
 * @author: https://github.com/Linmoqian
 */

import type { YoloPhoto } from './components/YoloTaskCard';

export type WorkbenchTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export abstract class WorkbenchTask {
  abstract readonly id: string;
  abstract readonly kind: string;
  abstract readonly title: string;
  abstract readonly status: WorkbenchTaskStatus;
  abstract readonly statusLabel: string;
  abstract readonly progress: number | null;
  abstract readonly progressLabel: string;
  abstract readonly summary: string;
  abstract readonly startedAt: number | null;
  abstract readonly finishedAt: number | null;

  get isComplete() {
    return this.status === 'completed';
  }

  elapsedMilliseconds(now: number) {
    if (this.startedAt === null) return 0;
    return Math.max(0, (this.finishedAt ?? now) - this.startedAt);
  }
}

export class ImageInferenceTask extends WorkbenchTask {
  readonly id = 'yolo-image-inference';
  readonly kind = 'image-inference';

  constructor(private readonly photos: readonly YoloPhoto[]) {
    super();
  }

  private get finishedCount() {
    return this.photos.filter((photo) => photo.status === 'done' || photo.status === 'error').length;
  }

  private get failedCount() {
    return this.photos.filter((photo) => photo.status === 'error').length;
  }

  private get allFinished() {
    return this.photos.length > 0 && this.photos.every(
      (photo) => photo.status === 'done' || photo.status === 'error',
    );
  }

  get title() {
    return `图片识别 · ${this.photos.length} 张图片`;
  }

  get status(): WorkbenchTaskStatus {
    if (this.allFinished) return this.failedCount ? 'failed' : 'completed';
    return this.photos.some((photo) => photo.status === 'running') ? 'running' : 'queued';
  }

  get statusLabel() {
    if (this.status === 'running') return '进行中';
    if (this.status === 'queued') return '等待处理';
    if (this.status === 'failed') return '已完成，含失败';
    return '已完成';
  }

  get progress() {
    return this.photos.length ? this.finishedCount / this.photos.length : 0;
  }

  get progressLabel() {
    return `已处理 ${this.finishedCount} / ${this.photos.length} 张`;
  }

  get summary() {
    const running = this.photos.find((photo) => photo.status === 'running');
    if (running) return `正在推理：${running.name}`;
    if (this.status === 'queued') return '图片已加入推理队列';
    if (this.failedCount) return `${this.failedCount} 张图片处理失败`;
    return '全部图片已处理';
  }

  get startedAt() {
    const times = this.photos
      .map((photo) => photo.startedAt)
      .filter((value): value is number => typeof value === 'number');
    return times.length ? Math.min(...times) : null;
  }

  get finishedAt() {
    if (!this.allFinished) return null;
    const times = this.photos
      .map((photo) => photo.finishedAt)
      .filter((value): value is number => typeof value === 'number');
    return times.length ? Math.max(...times) : null;
  }
}

export function createWorkbenchTasks(photos: readonly YoloPhoto[]) {
  return photos.length ? [new ImageInferenceTask(photos)] : [];
}
