# React 与 Tauri 前端开发规范

## 技术栈边界

- 沿用 React、TypeScript、Vite、Tailwind CSS、Zustand、TanStack Query、Motion 和 Lucide React。
- 不引入 Ant Design、Redux Toolkit 或另一套样式/状态体系来替换现状。
- Rust/SQLite 是业务数据事实来源；前端 Store 只维护交互状态、缓存和可恢复的视图状态。

## 目录与职责

- 页面按 `src/pages/<domain>/` 组织；领域 Hook 与页面就近放置。
- 跨两个以上功能稳定复用的组件才提升到 `src/components/`。
- Zustand Store 按领域拆分并由 `src/store/index.ts` 统一导出。
- UI、IPC 调用、数据转换和状态编排不要长期堆积在一个组件中。
- 全局 CSS 只保存主题与应用级规则；页面样式沿用 `src/styles/` 的现有约定。

## Tauri 交互

- `invoke` 参数、返回类型、事件载荷和 channel 消息必须有 TypeScript 类型。
- 订阅在组件卸载时取消；Rust 重启、窗口重载或 IPC 失败后不得保留假在线状态。
- 耗时操作显示进行中、成功与失败状态；错误信息应能指导用户恢复。
- 高频相机帧避免写入导致全应用重渲染的全局状态。

## 验证

- 先运行 `npx tsc --noEmit`；存在测试脚本时再运行对应单元/组件测试。
- 行为和页面改动需验证关键交互、错误态、空状态和重载后的恢复。
- 没有自动化测试时，记录可复现的手动步骤与未覆盖范围，不以“页面能打开”代替交互验证。
