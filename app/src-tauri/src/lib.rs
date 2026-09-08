// 应用组装入口：只负责启动 Tauri 与后续插件、命令的注册；
// IPC 边界放 commands/，领域逻辑放 domain/，外部能力放 services/。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
