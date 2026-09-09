use serde_json::{Map, Value};

pub(super) struct Target {
    pub(super) project_id: String,
    pub(super) worktree_id: String,
}

pub(super) struct ApplyColorInput {
    pub(super) color: String,
    pub(super) intent: Option<String>,
    pub(super) target: Target,
}

pub(super) struct ApplyCssInput {
    pub(super) changes: Vec<CssChange>,
    pub(super) page_url: String,
    pub(super) target: Target,
}

pub(super) struct CssChange {
    pub(super) after: String,
    pub(super) before: String,
    pub(super) style_sheet_url: String,
}

pub(super) struct ElementEvidence {
    pub(super) column: Option<i64>,
    pub(super) component_name: Option<String>,
    pub(super) file_name: Option<String>,
    pub(super) line: Option<i64>,
}

pub(super) struct LocateElementInput {
    pub(super) evidence: ElementEvidence,
    pub(super) outer_html: String,
    pub(super) page_url: String,
    pub(super) selector: String,
    pub(super) styles: Map<String, Value>,
    pub(super) target: Target,
}

pub(super) struct RecordVerificationInput {
    pub(super) detail: String,
    pub(super) page_url: String,
    pub(super) success: bool,
    pub(super) target: Target,
    pub(super) terminal_handle: String,
}
