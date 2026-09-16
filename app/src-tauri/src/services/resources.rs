/* 采集桌面端系统 CPU 与内存使用率，供育种台资源监视卡读取。
 * Created on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use std::thread;
use sysinfo::{
    CpuRefreshKind, MemoryRefreshKind, RefreshKind, System, MINIMUM_CPU_UPDATE_INTERVAL,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResources {
    cpu_percent: f32,
    memory_percent: f32,
    used_memory_bytes: u64,
    total_memory_bytes: u64,
}

struct ResourceMonitor {
    system: System,
    cpu_ready: bool,
}

static MONITOR: OnceLock<Mutex<ResourceMonitor>> = OnceLock::new();

fn monitor() -> &'static Mutex<ResourceMonitor> {
    MONITOR.get_or_init(|| {
        Mutex::new(ResourceMonitor {
            system: System::new_with_specifics(
                RefreshKind::new()
                    .with_memory(MemoryRefreshKind::new().with_ram())
                    .with_cpu(CpuRefreshKind::new().with_cpu_usage()),
            ),
            cpu_ready: false,
        })
    })
}

fn read_system_resources() -> Result<SystemResources, String> {
    let mut monitor = monitor()
        .lock()
        .map_err(|_| "系统资源监视器不可用".to_string())?;
    monitor.system.refresh_memory();
    if !monitor.cpu_ready {
        thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
        monitor.cpu_ready = true;
    }
    monitor.system.refresh_cpu_usage();

    let total_memory_bytes = monitor.system.total_memory();
    if total_memory_bytes == 0 {
        return Err("系统内存信息不可用".to_string());
    }
    let used_memory_bytes = monitor.system.used_memory();
    let memory_percent =
        ((used_memory_bytes as f64 / total_memory_bytes as f64) * 100.0).clamp(0.0, 100.0) as f32;

    Ok(SystemResources {
        cpu_percent: monitor.system.global_cpu_usage().clamp(0.0, 100.0),
        memory_percent,
        used_memory_bytes,
        total_memory_bytes,
    })
}

#[tauri::command]
pub async fn system_resources() -> Result<SystemResources, String> {
    tauri::async_runtime::spawn_blocking(read_system_resources)
        .await
        .map_err(|_| "系统资源查询中断".to_string())?
}
