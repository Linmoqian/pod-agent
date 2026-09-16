/* 验证开发人员终端与 SSH 配置界面的入口和基本状态。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import TerminalPanel from './TerminalPanel';

describe('TerminalPanel', () => {
  it('开发人员模式可以打开 SSH 配置界面并提交配置', async () => {
    const user = userEvent.setup();
    render(<TerminalPanel developerMode />);

    const sshTab = screen.getByRole('tab', { name: 'SSH' });
    expect(sshTab).toHaveAttribute('aria-selected', 'false');

    await user.click(sshTab);

    expect(screen.getByRole('heading', { name: 'SSH' })).toBeInTheDocument();
    expect(screen.getByLabelText('SSH 主机地址')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '连接' })).toBeDisabled();

    await user.type(screen.getByLabelText('SSH 主机地址'), 'example.internal');
    await user.type(screen.getByLabelText('SSH 用户名'), 'developer');

    const connectButton = screen.getByRole('button', { name: '连接' });
    expect(connectButton).toBeEnabled();
    await user.click(connectButton);

    expect(screen.getByRole('status')).toHaveTextContent('SSH 后端尚未接入');
  });

  it('非开发人员模式保持终端锁定且不显示 SSH 入口', () => {
    render(<TerminalPanel developerMode={false} />);

    expect(
      screen.getByRole('heading', { name: '终端已锁定' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'SSH' })).not.toBeInTheDocument();
  });
});
