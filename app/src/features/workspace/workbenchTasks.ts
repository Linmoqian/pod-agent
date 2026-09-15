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
  private readonly photoCount: number;
  private readonly finishedCountValue: number;
  private readonly failedCountValue: number;
  private readonly allFinishedValue: boolean;
  private readonly runningName: string | null;
  private readonly startedAtValue: number | null;
  private readonly finishedAtValue: number | null;

  constructor(photos: readonly YoloPhoto[]) {
    super();
    let finishedCount = 0;
    let failedCount = 0;
    let runningName: string | null = null;
    let startedAt = Number.POSITIVE_INFINITY;
    let finishedAt = Number.NEGATIVE_INFINITY;
    let allFinished = photos.length > 0;
    for (const photo of photos) {
      const finished = photo.status === 'done' || photo.status === 'error';
      if (finished) finishedCount += 1;
      if (photo.status === 'error') failedCount += 1;
      if (photo.status === 'running' && runningName === null) runningName = photo.name;
      if (!finished) allFinished = false;
      if (typeof photo.startedAt === 'number') startedAt = Math.min(startedAt, photo.startedAt);
      if (typeof photo.finishedAt === 'number') finishedAt = Math.max(finishedAt, photo.finishedAt);
    }
    this.photoCount = photos.length;
    this.finishedCountValue = finishedCount;
    this.failedCountValue = failedCount;
    this.allFinishedValue = allFinished;
    this.runningName = runningName;
    this.startedAtValue = Number.isFinite(startedAt) ? startedAt : null;
    this.finishedAtValue = allFinished && Number.isFinite(finishedAt) ? finishedAt : null;
  }

  private get finishedCount() {
    return this.finishedCountValue;
  }

  private get failedCount() {
    return this.failedCountValue;
  }

  private get allFinished() {
    return this.allFinishedValue;
  }

  get title() {
    return `图片识别 · ${this.photoCount} 张图片`;
  }

  get status(): WorkbenchTaskStatus {
    if (this.allFinished) return this.failedCount ? 'failed' : 'completed';
    return this.runningName ? 'running' : 'queued';
  }

  get statusLabel() {
    if (this.status === 'running') return '进行中';
    if (this.status === 'queued') return '等待处理';
    if (this.status === 'failed') return '已完成，含失败';
    return '已完成';
  }

  get progress() {
    return this.photoCount ? this.finishedCount / this.photoCount : 0;
  }

  get progressLabel() {
    return `已处理 ${this.finishedCount} / ${this.photoCount} 张`;
  }

  get summary() {
    if (this.runningName) return `正在推理：${this.runningName}`;
    if (this.status === 'queued') return '图片已加入推理队列';
    if (this.failedCount) return `${this.failedCount} 张图片处理失败`;
    return '全部图片已处理';
  }

  get startedAt() {
    return this.startedAtValue;
  }

  get finishedAt() {
    return this.finishedAtValue;
  }
}

export function createWorkbenchTasks(photos: readonly YoloPhoto[]) {
  return photos.length ? [new ImageInferenceTask(photos)] : [];
}
