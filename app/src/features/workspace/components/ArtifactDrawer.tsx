/*
 * 展示 Artifact 文件、运行记录与可逐级回溯的直接上游。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { App, Button, Drawer, Spin, Tag } from 'antd';
import { useEffect, useState } from 'react';

import { workspaceApi } from '../../../services/workspace';
import { statusColor } from '../status';
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
        <Button type="link" onClick={onBack}>
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
            <Button key={upstream.id} block onClick={() => onFollow(upstream)}>
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
            <Tag color={statusColor(run.status)}>{run.status}</Tag>
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
  const { message } = App.useApp();
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
      .catch((error) => alive && message.error(errorText(error)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [artifact, message]);

  const followUpstream = async (upstream: Artifact) => {
    setLoading(true);
    try {
      const next = await workspaceApi.artifactDetail(upstream.id);
      setTrail((items) => [...items, next]);
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      title="Artifact 血缘"
      size="large"
      open={Boolean(artifact)}
      onClose={onClose}
    >
      {loading && !detail ? (
        <Spin />
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
    </Drawer>
  );
}
