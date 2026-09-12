use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub connection: Mutex<Connection>,
    pub data_root: PathBuf,
    pub cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AppState {
    pub fn new(data_root: PathBuf, connection: Connection) -> Self {
        Self {
            connection: Mutex::new(connection),
            data_root,
            cancellations: Mutex::new(HashMap::new()),
        }
    }
}
