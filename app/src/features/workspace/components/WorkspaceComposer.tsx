/*
 * 统一承载研究问题、文件选择与文件夹选择的输入器。
 * Created on 2026-09-12
 * Updated on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import { Button, Dropdown, Input } from 'antd';

import AppIcon from '../../../components/common/AppIcon';
import styles from './WorkspaceComposer.module.css';

type WorkspaceComposerProps = {
  intent: string;
  busy: boolean;
  onIntentChange: (value: string) => void;
  onChooseData: (directory: boolean) => void;
  onSubmit: () => void;
};

export default function WorkspaceComposer({
  intent,
  busy,
  onIntentChange,
  onChooseData,
  onSubmit,
}: WorkspaceComposerProps) {
  return (
    <div className={styles.composer}>
      <Input.TextArea
        aria-label="研究问题"
        value={intent}
        onChange={(event) => onIntentChange(event.target.value)}
        onPressEnter={(event) => {
          if (!event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder="例如：比较不同环境下的株高表现，并筛选稳定材料……"
        autoSize={{ minRows: 3, maxRows: 7 }}
      />
      <div className={styles.actions}>
        <Dropdown
          menu={{
            items: [
              {
                key: 'file',
                label: '本地文件',
                onClick: () => onChooseData(false),
              },
              {
                key: 'folder',
                label: '本地文件夹',
                onClick: () => onChooseData(true),
              },
              {
                key: 'source',
                label: '连接数据源（V1 暂未开放）',
                disabled: true,
              },
            ],
          }}
        >
          <Button type="text" className={styles.dataButton}>
            <AppIcon name="add" size={15} />
            添加数据
          </Button>
        </Dropdown>
        <Button
          type="primary"
          shape="circle"
          aria-label="提交研究问题"
          onClick={onSubmit}
          disabled={!intent.trim() || busy}
        >
          <AppIcon name="send" size={17} />
        </Button>
      </div>
      <div className={styles.hint}>Enter 提交 · Shift + Enter 换行</div>
    </div>
  );
}
