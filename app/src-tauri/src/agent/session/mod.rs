pub mod create;
pub mod db;
pub mod delete;
pub mod read;
pub mod write;

use rusqlite::Row;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub thinking: String,
    pub tool_calls: String,
    pub tool_call_id: String,
    pub created_at: String,
}

pub fn session_from_row(row: &Row) -> Result<Session, rusqlite::Error> {
    Ok(Session {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

pub fn message_from_row(row: &Row) -> Result<Message, rusqlite::Error> {
    Ok(Message {
        id: row.get(0)?,
        session_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        thinking: row.get(4)?,
        tool_calls: row.get(5)?,
        tool_call_id: row.get(6)?,
        created_at: row.get(7)?,
    })
}

pub use create::*;
pub use delete::*;
pub use read::*;
pub use write::*;
