# Rust 与 Tauri 开发规范

## 适用原则

- 遵循项目现有 `agent/`、`api/`、`state.rs` 与 `paths.rs` 结构，不为套用通用分层而迁移目录。
- `lib.rs` 和 `main.rs` 只负责启动、状态注册、插件与 command 组装。
- Tauri command 保持轻薄：校验输入、获取状态、调用可测试逻辑、转换 IPC DTO。
- 领域规则、数据转换与算法尽量写成不依赖 Tauri 的纯函数。
- 使用 `rustfmt` 默认格式和 Rust 惯例；新增依赖前先确认标准库与现有依赖无法满足。

## 错误与安全

- 可失败操作返回 `Result`，错误保留可定位上下文；前端错误结构应稳定且不得泄露密钥、绝对路径或内部堆栈。
- 生产路径不随意使用 `unwrap`、`expect`、`panic!`、`todo!` 或 `unimplemented!`。
- 文件路径必须规范化并验证位于允许的数据目录，不能只做字符串前缀判断。
- capabilities 与 permissions 只开放实际需要的资源；原则上不使用 `unsafe`，确需使用时以 `SAFETY:` 说明不变量。

## 异步与并发

- 短时、非阻塞工作可用同步 command；I/O 与长任务使用异步或受控后台任务。
- CPU 密集推理不能阻塞 Tauri 异步运行时或 UI；是否并行必须由测量结果驱动。
- 锁范围尽量短，不跨 `await` 持锁，不在锁内执行网络、文件 I/O 或长计算。
- 高频生产者与消费者之间必须有明确容量、背压、关闭和错误传播语义。
- 应用退出或任务取消时回收相机、channel、线程、模型和文件句柄。

## 测试与检查

纯逻辑优先单元测试；跨模块能力使用 `app/src-tauri/tests/` 或根目录 `tests/`。根据改动范围执行：

```powershell
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

只有项目完整支持全部 feature 组合时才使用 `--all-features`。YOLO、相机或外部服务测试依赖本机资源时，必须明确前置条件和未覆盖范围。

## 参考

- [Tauri：从前端调用 Rust](https://tauri.app/develop/calling-rust/)
- [Tauri：Capabilities](https://tauri.app/security/capabilities/)
- [Rust 官方语言教程](https://doc.rust-lang.org/book/)
