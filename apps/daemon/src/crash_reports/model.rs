use serde::{Deserialize, Serialize};

// Why: The scalar-only map preserves existing report JSON field types and ordering.
pub(crate) type CrashReportDetails = serde_json::Map<String, serde_json::Value>;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CrashReportStatus {
    Pending,
    Sent,
    Dismissed,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CrashReportSource {
    Renderer,
    Child,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct CrashReportBreadcrumb {
    pub(crate) created_at: String,
    pub(crate) name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) data: Option<CrashReportDetails>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CrashReportRecord {
    pub(crate) id: String,
    pub(crate) created_at: String,
    pub(crate) status: CrashReportStatus,
    pub(crate) source: CrashReportSource,
    pub(crate) process_type: String,
    pub(crate) reason: String,
    pub(crate) exit_code: Option<i64>,
    pub(crate) app_version: String,
    pub(crate) platform: String,
    pub(crate) os_release: String,
    pub(crate) arch: String,
    pub(crate) chrome_version: String,
    pub(crate) details: CrashReportDetails,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) breadcrumbs: Option<Vec<CrashReportBreadcrumb>>,
}

/// Everything needed to create a report except the fields the store assigns
/// (`id`, `createdAt`, `status`) — mirrors `CrashReportCreateInput`.
pub(crate) struct CrashReportCreateInput {
    pub(crate) source: CrashReportSource,
    pub(crate) process_type: String,
    pub(crate) reason: String,
    pub(crate) exit_code: Option<i64>,
    pub(crate) app_version: String,
    pub(crate) platform: String,
    pub(crate) os_release: String,
    pub(crate) arch: String,
    pub(crate) chrome_version: String,
    pub(crate) details: CrashReportDetails,
    pub(crate) breadcrumbs: Vec<CrashReportBreadcrumb>,
}

/// Mirrors `CrashReportDiagnosticBundle` (a discriminated union in TypeScript).
#[derive(Clone, Debug)]
pub(crate) enum CrashReportDiagnosticBundle {
    Attached {
        bundle_submission_id: String,
        bytes: u64,
        span_count: u32,
    },
    NotUploaded {
        reason: String,
        bundle_submission_id: Option<String>,
        bytes: Option<u64>,
        span_count: Option<u32>,
    },
}

/// Mirrors `CrashReportCopySubmissionFailure`.
pub(crate) struct CrashReportCopySubmissionFailure {
    pub(crate) error: String,
    pub(crate) diagnostic_context: Option<CrashReportCopyDiagnosticContext>,
}

pub(crate) enum CrashReportCopyDiagnosticContext {
    Uploaded { ticket_id: String },
    NotUploaded { reason: String },
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum RendererErrorReportKind {
    ReactErrorBoundary,
    RendererUnhandledError,
    TerminalError,
}

impl RendererErrorReportKind {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::ReactErrorBoundary => "react-error-boundary",
            Self::RendererUnhandledError => "renderer-unhandled-error",
            Self::TerminalError => "terminal-error",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum RendererErrorSurface {
    AppRoot,
    WebRoot,
    WorkspaceShell,
    Sidebar,
    TerminalWorkbench,
    RightSidebar,
    Page,
    Modal,
    Overlay,
    RichMarkdownEditor,
}

impl RendererErrorSurface {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::AppRoot => "app-root",
            Self::WebRoot => "web-root",
            Self::WorkspaceShell => "workspace-shell",
            Self::Sidebar => "sidebar",
            Self::TerminalWorkbench => "terminal-workbench",
            Self::RightSidebar => "right-sidebar",
            Self::Page => "page",
            Self::Modal => "modal",
            Self::Overlay => "overlay",
            Self::RichMarkdownEditor => "rich-markdown-editor",
        }
    }
}

/// A `string | null | undefined` field from the wire, matching
/// `CrashReportNullableString`'s three states.
pub(crate) enum NullableField {
    Absent,
    Null,
    Value(String),
}

impl NullableField {
    /// Mirrors TS `nullableStringField`: `value === null ? null : stringField(value,
    /// maxLength)`. A present-but-blank string trims to `stringField`'s `undefined`,
    /// which collapses the *whole* result to "absent" here too — not `Null` — exactly
    /// like the TS source, where a blank string and a missing field both leave the
    /// final `activeModal` key out of the details object entirely.
    pub(crate) fn normalized(self, max_length: usize) -> Option<Option<String>> {
        match self {
            Self::Absent => None,
            Self::Null => Some(None),
            Self::Value(value) => string_field(&value, max_length).map(Some),
        }
    }
}

/// Mirrors JavaScript's `String(value)` coercion for one of the JSON scalars a
/// sanitized detail/breadcrumb-data value can hold.
pub(crate) fn js_string_scalar(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "null".to_owned(),
        serde_json::Value::String(text) => text.clone(),
        serde_json::Value::Bool(value) => value.to_string(),
        serde_json::Value::Number(number) => number.to_string(),
        other => other.to_string(),
    }
}

// Why: renderer limits use JavaScript UTF-16 units; protobuf strings cannot retain
// the lone high surrogate that slice() would produce at an astral-character boundary.
pub(crate) fn string_field(value: &str, max_length: usize) -> Option<String> {
    let trimmed = value.trim_matches(is_js_whitespace);
    if trimmed.is_empty() {
        return None;
    }
    Some(utf16_prefix(trimmed, max_length).to_owned())
}

pub(super) fn is_js_whitespace(character: char) -> bool {
    matches!(character, '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}'
        | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}'
        | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

pub(super) fn utf16_prefix(value: &str, max_length: usize) -> &str {
    let mut remaining = max_length;
    let end = value
        .char_indices()
        .find_map(|(index, character)| {
            let units = character.len_utf16();
            if units > remaining {
                Some(index)
            } else {
                remaining -= units;
                None
            }
        })
        .unwrap_or(value.len());
    &value[..end]
}

pub(crate) struct RendererErrorReportArgs {
    pub(crate) kind: RendererErrorReportKind,
    // Why: `origin_id`/`surface` are raw wire input, not yet validated — `None`/blank
    // means "reject with a business-level error", matching Bun's `normalizeArgs`
    // rather than a protocol-level `Status` (this is a typed RPC field, not a
    // transport violation).
    pub(crate) origin_id: String,
    pub(crate) surface: Option<RendererErrorSurface>,
    pub(crate) error_name: Option<String>,
    pub(crate) error_message: Option<String>,
    pub(crate) error_stack: Option<String>,
    pub(crate) component_stack: Option<String>,
    pub(crate) active_view: Option<String>,
    // Why: `Option<Option<String>>` mirrors `string | null | undefined` — outer `None`
    // omits the `details` key entirely, `Some(None)` writes it as JSON `null`,
    // `Some(Some(text))` writes the string. See `NullableField::normalized`.
    pub(crate) active_modal: Option<Option<String>>,
    pub(crate) active_tab_type: Option<Option<String>>,
    pub(crate) active_right_sidebar_tab: Option<Option<String>>,
    pub(crate) has_active_worktree: Option<bool>,
    pub(crate) chrome_version: Option<String>,
}

pub(crate) enum RendererErrorReportResult {
    // Why: `CrashReportRecord` is ~340 bytes, so it is boxed to keep this
    // result cheap to move on the far more common error path.
    Ok {
        report: Option<Box<CrashReportRecord>>,
        deduped: bool,
    },
    Err {
        error: String,
    },
}

pub(crate) struct CrashReportBreadcrumbRecordArgs {
    pub(crate) name: String,
    pub(crate) data: Option<CrashReportDetails>,
}

pub(crate) struct CrashReportSubmitArgs {
    pub(crate) report_id: Option<String>,
    pub(crate) notes: Option<String>,
    pub(crate) include_diagnostic_logs: Option<bool>,
    pub(crate) submit_anonymously: bool,
    pub(crate) github_login: Option<String>,
    pub(crate) github_email: Option<String>,
    pub(crate) chrome_version: Option<String>,
}

pub(crate) enum CrashReportSubmitResult {
    Ok {
        report: Option<CrashReportRecord>,
        diagnostic_bundle: Option<CrashReportDiagnosticBundle>,
    },
    Err {
        status: Option<i32>,
        error: String,
        report: Option<CrashReportRecord>,
        diagnostic_bundle: Option<CrashReportDiagnosticBundle>,
    },
}

pub(crate) struct CrashReportCopyDiagnosticsArgs {
    pub(crate) report_id: Option<String>,
    pub(crate) notes: Option<String>,
    pub(crate) submission_failure: Option<CrashReportCopySubmissionFailure>,
}

pub(crate) enum CrashReportCopyDiagnosticsResult {
    Ok { text: String },
    Err { error: String },
}
