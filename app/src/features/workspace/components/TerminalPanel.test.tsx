/* 验证开发人员终端与 SSH 配置界面的入口和基本状态。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import TerminalPanel from './TerminalPanel';

describe('TerminalPanel', () => {
  it('开发人员模式默认显示 SSH 对象列表，配置使用可取消的弹窗草稿', async () => {
    const user = userEvent.setup();
    render(<TerminalPanel developerMode />);

    const sshTab = screen.getByRole('tab', { name: 'SSH' });
    expect(sshTab).toHaveAttribute('aria-selected', 'false');

    await user.click(sshTab);

    expect(screen.getByRole('heading', { name: 'SSH' })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'SSH 连接列表' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('SSH 主机地址')).not.toBeInTheDocument();
    expect(
      screen.queryByText('对象配置仅保存在当前页面内存；SSH 后端接入后可按对象连接远程终端。'),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'SSH 对象 1，打开配置' }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('SSH 主机地址')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '连接' })).toBeDisabled();

    await user.type(
      screen.getByLabelText('SSH 主机地址'),
      'example.internal',
    );
    await user.type(screen.getByLabelText('SSH 用户名'), 'developer');

    const connectButton = screen.getByRole('button', { name: '连接' });
    expect(connectButton).toBeEnabled();
    await user.click(connectButton);

    expect(screen.getByRole('status')).toHaveTextContent('SSH 后端尚未接入');

    await user.click(screen.getByRole('button', { name: '取消' }));
    await user.click(
      screen.getByRole('button', { name: 'SSH 对象 1，打开配置' }),
    );
    expect(screen.getByLabelText('SSH 主机地址')).toHaveValue('');
  });

  it('新建 SSH 对象只有保存后才会加入列表', async () => {
    const user = userEvent.setup();
    render(<TerminalPanel developerMode />);

    await user.click(screen.getByRole('tab', { name: 'SSH' }));
    await user.click(screen.getByRole('button', { name: '新建对象' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByText('SSH 对象 1')).toBeInTheDocument();
    expect(screen.queryByText('SSH 对象 2')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新建对象' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText('SSH 对象 2')).toBeInTheDocument();
  });

  it('非开发人员模式保持终端锁定且不显示 SSH 入口', () => {
    render(<TerminalPanel developerMode={false} />);

    expect(
      screen.getByRole('heading', { name: '终端已锁定' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'SSH' })).not.toBeInTheDocument();
  });
});
