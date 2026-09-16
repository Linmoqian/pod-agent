use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use crate::services::agent::AgentManager;

pub struct AppState {
    pub connection: Mutex<Connection>,
    pub data_root: PathBuf,
    pub cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub terminal_enabled: AtomicBool,
    pub agent: AgentManager,
}

impl AppState {
    pub fn new(data_root: PathBuf, connection: Connection) -> Self {
        Self {
            connection: Mutex::new(connection),
            data_root,
            cancellations: Mutex::new(HashMap::new()),
            terminal_enabled: AtomicBool::new(false),
            agent: AgentManager::default(),
        }
    }
}
