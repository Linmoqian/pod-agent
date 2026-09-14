/*
 * 展示 Artifact 文件、运行记录与可逐级回溯的直接上游。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { workspaceApi } from '../../../services/workspace';
import { statusTone } from '../status';
import type { Artifact, ArtifactDetail } from '../types';
import styles from './ArtifactDrawer.module.css';

function errorText(error: unknown) {
  return typeof error === 'object' && error && 'message' in error
    ? String(error.message)
    : String(error);
}

function ArtifactContent({
  detail,
  trailLength,
  onBack,
  onFollow,
}: {
  detail: ArtifactDetail;
  trailLength: number;
  onBack: () => void;
  onFollow: (artifact: Artifact) => void;
}) {
  return (
    <div className={styles.provenance}>
      {trailLength > 1 && (
        <Button variant="link" onClick={onBack} className="px-0">
          ← 返回下游
        </Button>
      )}
      <h2>{detail.artifact.name}</h2>
      <code>{detail.artifact.artifactType}</code>
      <p>校验和：{detail.artifact.checksum}</p>
      {detail.dataset && (
        <section>
          <h3>来源 Dataset</h3>
          <dl className={styles.sourceGrid}>
            <dt>Dataset</dt>
            <dd>
              {detail.dataset.name} · v{detail.dataset.version}
            </dd>
            <dt>原始文件</dt>
            <dd>{String(detail.dataset.source.name ?? '—')}</dd>
            <dt>格式</dt>
            <dd>{String(detail.dataset.source.format ?? '—')}</dd>
            <dt>大小</dt>
            <dd>{String(detail.dataset.source.size ?? '—')} B</dd>
            <dt>源校验和</dt>
            <dd>
              <code>{String(detail.dataset.source.checksum ?? '—')}</code>
            </dd>
          </dl>
        </section>
      )}
      <section>
        <h3>上游 Artifact</h3>
        {detail.upstream.length ? (
          detail.upstream.map((upstream) => (
            <Button
              key={upstream.id}
              variant="outline"
              className="w-full"
              onClick={() => onFollow(upstream)}
            >
              {upstream.name}
            </Button>
          ))
        ) : (
          <p>无上游 Artifact</p>
        )}
      </section>
      <section>
        <h3>参数与元数据</h3>
        <pre>{JSON.stringify(detail.artifact.metadata, null, 2)}</pre>
      </section>
      <section>
        <h3>执行记录</h3>
        {detail.toolRuns.map((run) => (
          <div key={run.id} className={styles.runLog}>
            <b>
              {run.toolId} {run.toolVersion}
            </b>
            <Badge
              variant="outline"
              data-tone={statusTone(run.status)}
              className={styles.statusTag}
            >
              {run.status}
            </Badge>
            <pre>{JSON.stringify(run.input, null, 2)}</pre>
            <code>{run.log}</code>
          </div>
        ))}
      </section>
      <section>
        <h3>文件</h3>
        {detail.artifact.files.map((file) => (
          <p key={file.name}>
            {file.name} · {file.size} B<br />
            <code>{file.checksum}</code>
          </p>
        ))}
      </section>
    </div>
  );
}

type ArtifactDrawerProps = {
  artifact: Artifact | null;
  onClose: () => void;
};

export default function ArtifactDrawer({
  artifact,
  onClose,
}: ArtifactDrawerProps) {
  const [trail, setTrail] = useState<ArtifactDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const detail = trail[trail.length - 1];

  useEffect(() => {
    let alive = true;
    if (!artifact) {
      setTrail([]);
      return () => {
        alive = false;
      };
    }
    setLoading(true);
    workspaceApi
      .artifactDetail(artifact.id)
      .then((value) => alive && setTrail([value]))
      .catch((error) => alive && toast.error(errorText(error)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [artifact]);

  const followUpstream = async (upstream: Artifact) => {
    setLoading(true);
    try {
      const next = await workspaceApi.artifactDetail(upstream.id);
      setTrail((items) => [...items, next]);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      open={Boolean(artifact)}
      onOpenChange={(next) => !next && onClose()}
    >
      <SheetContent side="right" className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Artifact 血缘</SheetTitle>
        </SheetHeader>
        {loading && !detail ? (
          <div
            className="flex items-center justify-center py-10 text-muted-foreground"
            role="status"
          >
            <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
          </div>
        ) : (
          detail && (
            <ArtifactContent
              detail={detail}
              trailLength={trail.length}
              onBack={() => setTrail((items) => items.slice(0, -1))}
              onFollow={(upstream) => void followUpstream(upstream)}
            />
          )
        )}
      </SheetContent>
    </Sheet>
  );
}
