/*
 * 常驻 Node Agent 管理器：单进程、多会话、请求级分发与崩溃恢复。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::services::yolo;

const PROTOCOL_VERSION: u64 = 2;
const ABORT_GRACE_PERIOD: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(100);

type PendingSender = Sender<Result<Value, AppError>>;

#[derive(Clone)]
struct PendingRequest {
    sender: PendingSender,
    abort_requested: Arc<AtomicBool>,
}

#[derive(Clone, Default)]
pub struct AgentManager {
    inner: Arc<Mutex<ManagerState>>,
    owner: Arc<()>,
}

#[derive(Default)]
struct ManagerState {
    generation: u64,
    process: Option<AgentProcess>,
    pending: HashMap<String, PendingRequest>,
}

struct AgentProcess {
    generation: u64,
    stdin: Arc<Mutex<ChildStdin>>,
    child: Arc<Mutex<Child>>,
}

struct RuntimePaths {
    node: PathBuf,
    script: PathBuf,
    resource_root: PathBuf,
    model_manifest: PathBuf,
    working_directory: PathBuf,
    use_env_file: bool,
}

impl AgentManager {
    /// 启动或取得当前常驻进程。进程本身只在首个请求到达时惰性创建。
    fn ensure_process(&self, app: &AppHandle) -> AppResult<()> {
        let mut state = self
            .inner
            .lock()
            .map_err(|_| AppError::retryable("AGENT_MANAGER_BUSY", "Agent 管理器暂时不可用"))?;
        if state.process.is_some() {
            return Ok(());
        }
        state.generation = state.generation.saturating_add(1);
        let generation = state.generation;
        let (process, stdout) = spawn_process(app, generation)?;
        state.process = Some(process);
        start_reader(Arc::clone(&self.inner), generation, stdout);
        Ok(())
    }

    /// 向常驻进程发送一个 prompt，并等待 result + settled 双重结束标记。
    pub fn prompt<F>(
        &self,
        app: &AppHandle,
        request: Value,
        timeout: Duration,
        mut on_event: F,
    ) -> AppResult<Value>
    where
        F: FnMut(&Value),
    {
        validate_prompt_request(&request)?;
        let request_id = request["requestId"]
            .as_str()
            .ok_or_else(|| AppError::new("AGENT_PROTOCOL_ERROR", "缺少 requestId"))?
            .to_string();
        self.ensure_process(app)?;

        let (sender, receiver) = mpsc::channel();
        let abort_requested = Arc::new(AtomicBool::new(false));
        let generation = {
            let mut state = self
                .inner
                .lock()
                .map_err(|_| AppError::retryable("AGENT_MANAGER_BUSY", "Agent 管理器暂时不可用"))?;
            if state.pending.contains_key(&request_id) {
                return Err(AppError::new("AGENT_BUSY", "相同请求正在处理中"));
            }
            let process = state
                .process
                .as_ref()
                .ok_or_else(|| AppError::retryable("AGENT_UNAVAILABLE", "Agent 进程未启动"))?;
            let generation = process.generation;
            let stdin = Arc::clone(&process.stdin);
            state.pending.insert(
                request_id.clone(),
                PendingRequest {
                    sender,
                    abort_requested: Arc::clone(&abort_requested),
                },
            );
            if let Err(error) = write_json_line(&stdin, &request) {
                state.pending.remove(&request_id);
                drop(state);
                self.stop_process(generation, "Agent 请求写入失败");
                return Err(error);
            }
            generation
        };

        let started = Instant::now();
        let mut result: Option<Value> = None;
        let mut abort_deadline: Option<Instant> = None;
        let mut timed_out = false;

        loop {
            if abort_requested.load(Ordering::Relaxed) && abort_deadline.is_none() {
                abort_deadline = Some(Instant::now() + ABORT_GRACE_PERIOD);
            }
            let wait_for = match abort_deadline {
                Some(deadline) => deadline.saturating_duration_since(Instant::now()),
                None => timeout.saturating_sub(started.elapsed()),
            };
            if wait_for.is_zero() {
                if abort_deadline.is_some() {
                    self.stop_process(generation, "Agent 取消未在宽限期内结束");
                    self.remove_pending(&request_id);
                    return Err(AppError::retryable(
                        "AGENT_TIMEOUT",
                        "Agent 取消未在 5 秒内结束，已重启进程",
                    ));
                }
                if self.abort(&request_id).is_err() {
                    self.stop_process(generation, "Agent 超时且无法发送取消");
                    self.remove_pending(&request_id);
                    return Err(AppError::retryable(
                        "AGENT_TIMEOUT",
                        format!("Agent 响应超过 {} 秒", timeout.as_secs()),
                    ));
                }
                timed_out = true;
                abort_deadline = Some(Instant::now() + ABORT_GRACE_PERIOD);
                continue;
            }

            match receiver.recv_timeout(wait_for.min(POLL_INTERVAL)) {
                Ok(Ok(value)) => match value["type"].as_str() {
                    Some("accepted") => {}
                    Some("event") => on_event(&value),
                    Some("result") => {
                        if result.is_some() {
                            self.remove_pending(&request_id);
                            return Err(AppError::retryable(
                                "AGENT_PROTOCOL_ERROR",
                                "Agent 重复发送 result",
                            ));
                        }
                        result = Some(value);
                    }
                    Some("settled") => {
                        self.remove_pending(&request_id);
                        if result.is_none() {
                            return Err(AppError::retryable(
                                "AGENT_PROTOCOL_ERROR",
                                "Agent 在 result 前发送 settled",
                            ));
                        }
                        let settled_status = value["status"].as_str().unwrap_or_default();
                        let result_ok = result.as_ref().and_then(|item| item["ok"].as_bool());
                        if (settled_status == "succeeded" && result_ok != Some(true))
                            || (settled_status != "succeeded" && result_ok != Some(false))
                        {
                            return Err(AppError::retryable(
                                "AGENT_PROTOCOL_ERROR",
                                "Agent result 与 settled 状态不一致",
                            ));
                        }
                        if timed_out {
                            return Err(AppError::retryable(
                                "AGENT_TIMEOUT",
                                format!("Agent 响应超过 {} 秒", timeout.as_secs()),
                            ));
                        }
                        let result = result.ok_or_else(|| {
                            AppError::retryable("AGENT_PROTOCOL_ERROR", "Agent 缺少 result")
                        })?;
                        return Ok(result);
                    }
                    Some("ready") => {}
                    Some("error") => {
                        self.remove_pending(&request_id);
                        return Err(AppError::retryable(
                            "AGENT_PROTOCOL_ERROR",
                            "Agent 返回了未关联请求的协议错误",
                        ));
                    }
                    _ => {
                        self.remove_pending(&request_id);
                        return Err(AppError::retryable(
                            "AGENT_PROTOCOL_ERROR",
                            "Agent 返回未知消息类型",
                        ));
                    }
                },
                Ok(Err(error)) => {
                    self.remove_pending(&request_id);
                    return Err(error);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    self.remove_pending(&request_id);
                    return Err(AppError::retryable(
                        "AGENT_PROCESS_EXITED",
                        "Agent 进程已退出，请重试",
                    ));
                }
            }
        }
    }

    /// 取消指定请求；Node 端再调用 Pi Agent.abort，并沿工具 AbortSignal 传播。
    pub fn abort(&self, request_id: &str) -> AppResult<()> {
        if request_id.trim().is_empty() {
            return Err(AppError::new("REQUEST_ID_REQUIRED", "缺少 Agent 请求 ID"));
        }
        let state = self
            .inner
            .lock()
            .map_err(|_| AppError::retryable("AGENT_MANAGER_BUSY", "Agent 管理器暂时不可用"))?;
        let process = state
            .process
            .as_ref()
            .ok_or_else(|| AppError::new("AGENT_NOT_FOUND", "Agent 请求不存在"))?;
        let pending = state
            .pending
            .get(request_id)
            .ok_or_else(|| AppError::new("AGENT_NOT_FOUND", "Agent 请求不存在"))?;
        pending.abort_requested.store(true, Ordering::Relaxed);
        write_json_line(
            &process.stdin,
            &json!({
                "protocol": PROTOCOL_VERSION,
                "type": "abort",
                "requestId": request_id,
            }),
        )
    }

    fn remove_pending(&self, request_id: &str) {
        if let Ok(mut state) = self.inner.lock() {
            state.pending.remove(request_id);
        }
    }

    /// 终止当前进程并唤醒全部请求；下一次 prompt 会自动启动新进程。
    fn stop_process(&self, generation: u64, reason: &str) {
        let (process, pending) = match self.inner.lock() {
            Ok(mut state) => {
                if state
                    .process
                    .as_ref()
                    .is_none_or(|process| process.generation != generation)
                {
                    return;
                }
                let process = state.process.take();
                let pending = state
                    .pending
                    .drain()
                    .map(|(_, pending)| pending.sender)
                    .collect::<Vec<_>>();
                (process, pending)
            }
            Err(_) => return,
        };
        for sender in pending {
            let _ = sender.send(Err(AppError::retryable("AGENT_PROCESS_RESTARTED", reason)));
        }
        if let Some(process) = process {
            if let Ok(mut child) = process.child.lock() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    pub fn shutdown(&self) {
        let generation = self
            .inner
            .lock()
            .ok()
            .and_then(|state| state.process.as_ref().map(|process| process.generation));
        if let Some(generation) = generation {
            self.stop_process(generation, "应用正在退出");
        }
    }
}

impl Drop for AgentManager {
    fn drop(&mut self) {
        if Arc::strong_count(&self.owner) == 1 {
            self.shutdown();
        }
    }
}

fn write_json_line(stdin: &Arc<Mutex<ChildStdin>>, value: &Value) -> AppResult<()> {
    let line = serde_json::to_string(value)
        .map_err(|error| AppError::new("AGENT_PROTOCOL_ERROR", error.to_string()))?;
    let mut stdin = stdin
        .lock()
        .map_err(|_| AppError::retryable("AGENT_MANAGER_BUSY", "Agent 输入流暂时不可用"))?;
    stdin
        .write_all(line.as_bytes())
        .and_then(|_| stdin.write_all(b"\n"))
        .and_then(|_| stdin.flush())
        .map_err(|error| AppError::retryable("AGENT_PROTOCOL_ERROR", error.to_string()))
}

fn spawn_process(app: &AppHandle, generation: u64) -> AppResult<(AgentProcess, ChildStdout)> {
    let paths = runtime_paths(app)?;
    let (yolo_url, yolo_token) = yolo::endpoint(&paths.resource_root)
        .map_err(|error| AppError::retryable("YOLO_UNAVAILABLE", error))?;
    let mut command = Command::new(&paths.node);
    if paths.use_env_file {
        command.arg("--env-file-if-exists=agent/.env");
    }
    let mut child = command
        .arg(&paths.script)
        .current_dir(&paths.working_directory)
        .env("YOLO_ONNX_URL", yolo_url)
        .env("YOLO_ONNX_TOKEN", yolo_token)
        .env("POD_AGENT_RESOURCE_ROOT", &paths.resource_root)
        .env("POD_AGENT_MODEL_MANIFEST", &paths.model_manifest)
        .env(
            "POD_AGENT_PACKAGED",
            if paths.use_env_file { "0" } else { "1" },
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| AppError::retryable("AGENT_UNAVAILABLE", error.to_string()))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::new("AGENT_PROTOCOL_ERROR", "无法写入 Agent 进程"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::new("AGENT_PROTOCOL_ERROR", "无法读取 Agent 输出"))?;
    let process = AgentProcess {
        generation,
        stdin: Arc::new(Mutex::new(stdin)),
        child: Arc::new(Mutex::new(child)),
    };
    Ok((process, stdout))
}

fn runtime_paths(app: &AppHandle) -> AppResult<RuntimePaths> {
    if cfg!(debug_assertions) {
        let app_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let resource_root = app_root
            .parent()
            .ok_or_else(|| AppError::new("AGENT_RESOURCE_UNAVAILABLE", "无法解析资源根目录"))?
            .to_path_buf();
        return Ok(RuntimePaths {
            node: PathBuf::from("node"),
            script: app_root.join("agent").join("agent.ts"),
            resource_root,
            model_manifest: app_root.join("agent/tools/yolo-models.json"),
            working_directory: app_root,
            use_env_file: true,
        });
    }
    let resource_root = app
        .path()
        .resolve("agent-resources", BaseDirectory::Resource)
        .map_err(|error| AppError::retryable("AGENT_RESOURCE_UNAVAILABLE", error.to_string()))?;
    let script = app
        .path()
        .resolve("agent/agent.mjs", BaseDirectory::Resource)
        .map_err(|error| AppError::retryable("AGENT_RESOURCE_UNAVAILABLE", error.to_string()))?;
    let node = app
        .path()
        .resolve("node-runtime/bin/node", BaseDirectory::Resource)
        .map_err(|error| AppError::retryable("NODE_RUNTIME_UNAVAILABLE", error.to_string()))?;
    Ok(RuntimePaths {
        node,
        script,
        model_manifest: resource_root.join("agent/tools/yolo-models.json"),
        working_directory: resource_root.clone(),
        resource_root,
        use_env_file: false,
    })
}

fn validate_prompt_request(value: &Value) -> AppResult<()> {
    if value["protocol"].as_u64() != Some(PROTOCOL_VERSION)
        || value["type"].as_str() != Some("prompt")
    {
        return Err(AppError::new(
            "AGENT_PROTOCOL_ERROR",
            "prompt 协议版本或类型无效",
        ));
    }
    for field in ["requestId", "conversationId", "mode", "message"] {
        let Some(field_value) = value[field].as_str() else {
            return Err(AppError::new(
                "AGENT_PROTOCOL_ERROR",
                format!("prompt 缺少有效字段: {field}"),
            ));
        };
        if field_value.is_empty() {
            return Err(AppError::new(
                "AGENT_PROTOCOL_ERROR",
                format!("prompt 缺少有效字段: {field}"),
            ));
        }
    }
    for field in ["requestId", "conversationId"] {
        let field_value = value[field].as_str().ok_or_else(|| {
            AppError::new(
                "AGENT_PROTOCOL_ERROR",
                format!("prompt 缺少有效字段: {field}"),
            )
        })?;
        uuid::Uuid::parse_str(field_value)
            .map_err(|_| AppError::new("AGENT_PROTOCOL_ERROR", format!("{field} 必须是 UUID")))?;
    }
    if !matches!(value["mode"].as_str(), Some("discuss" | "plan")) {
        return Err(AppError::new("AGENT_PROTOCOL_ERROR", "prompt mode 无效"));
    }
    if !value["model"].is_object() || !value["history"].is_array() || !value["context"].is_object()
    {
        return Err(AppError::new(
            "AGENT_PROTOCOL_ERROR",
            "prompt 上下文结构无效",
        ));
    }
    Ok(())
}

fn validate_output(value: &Value) -> Result<(), String> {
    if value["protocol"].as_u64() != Some(PROTOCOL_VERSION) {
        return Err("protocol 不是 2".into());
    }
    match value["type"].as_str() {
        Some("ready") => {
            if !value["capabilities"]["sessions"].is_boolean()
                || !value["capabilities"]["abort"].is_boolean()
            {
                return Err("ready capabilities 无效".into());
            }
        }
        Some("accepted") => require_request_id(value)?,
        Some("event") => {
            require_request_id(value)?;
            if value["conversationId"].as_str().is_none_or(str::is_empty)
                || value["eventType"].as_str().is_none_or(str::is_empty)
                || value["kind"].as_str().is_none_or(str::is_empty)
                || value["delta"].as_str().is_none()
            {
                return Err("event 字段无效".into());
            }
        }
        Some("result") => {
            require_request_id(value)?;
            if !value["ok"].is_boolean() {
                return Err("result.ok 无效".into());
            }
            if value["ok"] == true {
                if value["reply"].as_str().is_none() {
                    return Err("成功 result 缺少 reply".into());
                }
            } else if value["errorCode"].as_str().is_none_or(str::is_empty)
                || value["error"].as_str().is_none_or(str::is_empty)
            {
                return Err("失败 result 缺少稳定错误字段".into());
            }
        }
        Some("settled") => {
            require_request_id(value)?;
            if !matches!(
                value["status"].as_str(),
                Some("succeeded" | "failed" | "aborted")
            ) {
                return Err("settled.status 无效".into());
            }
        }
        Some("error") => {}
        _ => return Err("未知 stdout 消息类型".into()),
    }
    Ok(())
}

fn require_request_id(value: &Value) -> Result<(), String> {
    let Some(request_id) = value["requestId"].as_str() else {
        return Err("缺少 requestId".into());
    };
    uuid::Uuid::parse_str(request_id).map_err(|_| "requestId 不是 UUID".to_string())?;
    Ok(())
}

fn dispatch_line(inner: &Arc<Mutex<ManagerState>>, generation: u64, line: &str) {
    let value = match serde_json::from_str::<Value>(line) {
        Ok(value) => value,
        Err(_) => return,
    };
    if let Err(error) = validate_output(&value) {
        if let Some(request_id) = value["requestId"].as_str() {
            if let Ok(state) = inner.lock() {
                if let Some(pending) = state.pending.get(request_id) {
                    let _ = pending
                        .sender
                        .send(Err(AppError::retryable("AGENT_PROTOCOL_ERROR", error)));
                }
            }
        }
        return;
    }
    if value["type"] == "ready" {
        return;
    }
    let Some(request_id) = value["requestId"].as_str() else {
        return;
    };
    let sender = inner.lock().ok().and_then(|state| {
        if state
            .process
            .as_ref()
            .is_some_and(|process| process.generation == generation)
        {
            state
                .pending
                .get(request_id)
                .map(|pending| pending.sender.clone())
        } else {
            None
        }
    });
    if let Some(sender) = sender {
        let _ = sender.send(Ok(value));
    }
}

fn process_exited(inner: &Arc<Mutex<ManagerState>>, generation: u64) {
    let (child, pending) = match inner.lock() {
        Ok(mut state) => {
            if state
                .process
                .as_ref()
                .is_none_or(|process| process.generation != generation)
            {
                return;
            }
            let child = state.process.take().map(|process| process.child);
            let pending = state
                .pending
                .drain()
                .map(|(_, pending)| pending.sender)
                .collect::<Vec<_>>();
            (child, pending)
        }
        Err(_) => return,
    };
    for sender in pending {
        let _ = sender.send(Err(AppError::retryable(
            "AGENT_PROCESS_EXITED",
            "Agent 进程异常退出，请重试",
        )));
    }
    if let Some(child) = child {
        if let Ok(mut child) = child.lock() {
            let _ = child.wait();
        }
    }
}

// 进程 stdout 线程通过闭包捕获 manager inner；使用独立函数便于保持 reader 不持有 Child 锁。
fn start_reader(
    inner: Arc<Mutex<ManagerState>>,
    generation: u64,
    stdout: impl std::io::Read + Send + 'static,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => dispatch_line(&inner, generation, &line),
                Err(_) => break,
            }
        }
        process_exited(&inner, generation);
    });
}
