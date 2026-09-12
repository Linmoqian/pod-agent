use serde::Serialize;
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDescriptor {
    pub id: &'static str,
    pub version: &'static str,
    pub accepts: &'static [&'static str],
    pub produces: &'static [&'static str],
    pub input_schema: Value,
    pub output_schema: Value,
    pub risk_level: &'static str,
}

pub fn get(tool_id: &str) -> AppResult<ToolDescriptor> {
    match tool_id {
        "data.quality_check" => Ok(ToolDescriptor {
            id: "data.quality_check",
            version: "1.0.0",
            accepts: &["phenotype"],
            produces: &["quality.report"],
            input_schema: json!({"type":"object","required":["datasetId"]}),
            output_schema: json!({"type":"object","required":["status"]}),
            risk_level: "read_only",
        }),
        "breeding.multi_environment_blup" => Ok(ToolDescriptor {
            id: "breeding.multi_environment_blup",
            version: "1.0.0",
            accepts: &["phenotype"],
            produces: &["model.fit", "breeding.blup", "breeding.gxe"],
            input_schema: json!({"type":"object","required":["datasetId","traitId","modelSpec"]}),
            output_schema: json!({"type":"object","required":["diagnostics","artifacts"]}),
            risk_level: "scientific_judgment",
        }),
        "report.compose" => Ok(ToolDescriptor {
            id: "report.compose",
            version: "1.0.0",
            accepts: &["model.fit", "breeding.blup", "breeding.gxe"],
            produces: &["report.analysis"],
            input_schema: json!({"type":"object","required":["artifactIds"]}),
            output_schema: json!({"type":"object","required":["artifactType"]}),
            risk_level: "read_only",
        }),
        _ => Err(AppError::new("UNKNOWN_TOOL", "工具未登记，拒绝执行")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_tool() {
        assert_eq!(get("system.run_command").unwrap_err().code, "UNKNOWN_TOOL");
    }
}
