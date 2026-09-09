use serde_json::Value;

use super::text::{
    is_ecmascript_whitespace, normalize_crlf, trim, trim_end, utf16_len, utf16_prefix,
};
use super::{GenerationParams, PullRequestContext};

const DIFF_LIMIT: usize = 200_000;

pub(super) struct CommitContext {
    pub(super) branch: Option<String>,
    pub(super) patch: String,
    pub(super) summary: String,
}

pub(super) fn commit(context: &CommitContext, params: &GenerationParams) -> String {
    let patch = if context.patch.trim().is_empty() {
        "(diff omitted — too large to read; infer the change from the staged file list above)"
            .to_owned()
    } else {
        truncate(&context.patch, DIFF_LIMIT)
    };
    let base = [
        "You are generating a single git commit message.".to_owned(),
        "Return only the commit message text. Do not include a preamble, quotes, or code fences."
            .to_owned(),
        String::new(),
        "Rules:".to_owned(),
        "- First line: imperative mood, <= 72 chars, no trailing period.".to_owned(),
        "- Optional body: blank line, then short wrapped bullet points or prose explaining WHY."
            .to_owned(),
        "- Capture the primary user-visible or developer-visible change.".to_owned(),
        "- Use only the staged changes below as context.".to_owned(),
        "- Do not include \"Co-authored-by\" or other git trailers.".to_owned(),
        String::new(),
        format!(
            "Branch: {}",
            context.branch.as_deref().unwrap_or("(detached)")
        ),
        String::new(),
        "Staged files:".to_owned(),
        limit_section(&context.summary, 6_000),
        String::new(),
        "Staged patch:".to_owned(),
        "```diff".to_owned(),
        patch,
        "```".to_owned(),
    ]
    .join("\n");
    apply_template(
        params,
        &base,
        &[
            ("branch", context.branch.as_deref().unwrap_or("(detached)")),
            ("stagedFiles", &context.summary),
            ("stagedPatch", &context.patch),
        ],
    )
}

pub(super) fn pull_request(context: &PullRequestContext, params: &GenerationParams) -> String {
    let base = [
        "You are generating pull request details.".to_owned(),
        "Return ONLY compact JSON with this exact shape:".to_owned(),
        "{\"base\":\"branch-name\",\"title\":\"short title\",\"body\":\"markdown description\",\"draft\":false}".to_owned(),
        String::new(),
        "Rules:".to_owned(),
        "- Use the branch diff and commits below as source of truth.".to_owned(),
        "- Keep the base branch as the current base unless the diff clearly targets a different branch.".to_owned(),
        "- Title: concise, specific, no trailing period.".to_owned(),
        "- Body: useful Markdown summary for reviewers. Include testing notes only when evidence exists.".to_owned(),
        "- If Current description contains a pull request template, preserve its headings, required sections, and checklists while filling relevant sections from the branch changes.".to_owned(),
        "- Leave genuinely unknown template items as TODO or unchecked instead of deleting them.".to_owned(),
        "- draft: true only when the changes clearly look unfinished, WIP, or unsafe to review.".to_owned(),
        "- Do not include labels, reviewers, code fences, prose, or any keys beyond base/title/body/draft.".to_owned(),
        String::new(),
        format!("Head branch: {}", context.branch.as_deref().unwrap_or("(detached)")),
        format!("Current base: {}", context.base),
        format!("Current title: {}", empty_label(&context.title)),
        format!("Current description: {}", empty_label(&context.body)),
        format!("Current draft: {}", context.draft),
        String::new(),
        "Commits:".to_owned(),
        limit_section(empty_label(&context.commits), 8_000),
        String::new(),
        "Changed files:".to_owned(),
        limit_section(empty_label(&context.changes), 8_000),
        String::new(),
        "Patch:".to_owned(),
        "```diff".to_owned(),
        truncate(&context.patch, DIFF_LIMIT),
        "```".to_owned(),
    ]
    .join("\n");
    let output = apply_template(
        params,
        &base,
        &[
            ("branch", context.branch.as_deref().unwrap_or("(detached)")),
            ("baseBranch", &context.base),
            ("currentTitle", &context.title),
            ("currentBody", &context.body),
            ("commitSummary", &context.commits),
            ("changedFiles", &context.changes),
            ("patch", &context.patch),
        ],
    );
    format!(
        "{output}\n\nFinal output requirement:\nReturn compact JSON only with keys base, title, body, and draft. No prose or code fences."
    )
}

fn apply_template(params: &GenerationParams, base: &str, values: &[(&str, &str)]) -> String {
    if let Some(template) = params.command_input_template.as_deref() {
        let mut output = template.replace("{basePrompt}", base);
        for (key, value) in values {
            output = output.replace(&format!("{{{key}}}"), value);
        }
        return output;
    }
    let custom = params.custom_prompt.as_deref().unwrap_or_default().trim();
    if custom.is_empty() {
        base.to_owned()
    } else {
        format!(
            "{base}\n\nAdditional user prompt:\n{}",
            limit_section(custom, 4_000)
        )
    }
}

pub(super) fn parse_commit_output(raw: &str) -> String {
    let cleaned = clean(raw);
    let (subject_line, body) = cleaned
        .split_once('\n')
        .map_or((cleaned.as_str(), ""), |(subject, body)| (subject, body));
    let subject = trim_end(utf16_prefix(trim(subject_line).trim_end_matches('.'), 72)).to_owned();
    let subject = if subject.is_empty() {
        "Update project files".to_owned()
    } else {
        subject
    };
    let body = trim(body).to_owned();
    if body.is_empty() {
        subject
    } else {
        format!("{subject}\n\n{body}")
    }
}

pub(super) fn parse_pull_request_output(
    raw: &str,
    context: &PullRequestContext,
) -> Result<Value, serde_json::Error> {
    let text = strip_json_fence(raw);
    let parsed: Value = serde_json::from_str(text)?;
    let Some(object) = parsed.as_object() else {
        return Err(serde_json::Error::io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Expected a JSON object.",
        )));
    };
    let base = object
        .get("base")
        .and_then(Value::as_str)
        .map(trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&context.base);
    let title = object
        .get("title")
        .and_then(Value::as_str)
        .map(trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(trim(&context.title))
        .trim_end_matches('.');
    let body = object
        .get("body")
        .and_then(Value::as_str)
        .unwrap_or(&context.body)
        .trim_end_matches(super::text::is_ecmascript_whitespace);
    let draft = object
        .get("draft")
        .and_then(Value::as_bool)
        .unwrap_or(context.draft);
    Ok(
        serde_json::json!({ "base": base, "title": if title.is_empty() { "Update project files" } else { title }, "body": body, "draft": draft }),
    )
}

fn strip_json_fence(raw: &str) -> &str {
    let trimmed = trim(raw);
    let value = json_fence_body(trimmed).map_or(trimmed, trim);
    match (value.find('{'), value.rfind('}')) {
        (Some(start), Some(end)) if end > start => &value[start..=end],
        _ => value,
    }
}

fn json_fence_body(value: &str) -> Option<&str> {
    let body_start = line_break_end(value, 3).or_else(|| {
        value
            .get(..7)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("```json"))
            .then(|| line_break_end(value, 7))
            .flatten()
    })?;
    let close = value.len().checked_sub(3)?;
    if !value.ends_with("```") {
        return None;
    }
    let prefix = &value[..close];
    let body_end = if prefix.ends_with("\r\n") {
        close - 2
    } else if prefix.ends_with(['\r', '\n']) {
        close - 1
    } else {
        return None;
    };
    Some(&value[body_start..body_end])
}

fn line_break_end(value: &str, index: usize) -> Option<usize> {
    match value.as_bytes().get(index) {
        Some(b'\n') => Some(index + 1),
        Some(b'\r') if value.as_bytes().get(index + 1) == Some(&b'\n') => Some(index + 2),
        Some(b'\r') => Some(index + 1),
        _ => None,
    }
}

fn clean(raw: &str) -> String {
    let normalized = normalize_crlf(raw);
    let mut text = trim(&normalized);
    if let Some((first, rest)) = text.split_once('\n')
        && (preamble(first) || ellipsis(first))
    {
        text = trim(rest);
    }
    if let Some(body) = commit_fence_body(text) {
        text = trim(body);
    }
    strip_list_prefix(text).to_owned()
}

fn preamble(line: &str) -> bool {
    ["generating", "thinking"].into_iter().any(|prefix| {
        line.get(..prefix.len())
            .is_some_and(|value| value.eq_ignore_ascii_case(prefix))
            && line[prefix.len()..]
                .chars()
                .next()
                .is_none_or(|character| !character.is_ascii_alphanumeric() && character != '_')
    })
}

fn ellipsis(line: &str) -> bool {
    let line = trim(line);
    !line.is_empty() && line.chars().all(|character| matches!(character, '.' | '…'))
}

fn commit_fence_body(value: &str) -> Option<&str> {
    let header = value.strip_prefix("```")?;
    let line_end = header.find('\n')?;
    if !header[..line_end]
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return None;
    }
    let close = value.len().checked_sub(3)?;
    (value.ends_with("```") && value.as_bytes().get(close - 1) == Some(&b'\n'))
        .then(|| &value[3 + line_end + 1..close - 1])
}

fn strip_list_prefix(value: &str) -> &str {
    let leading = value.len() - value.trim_start_matches(is_ecmascript_whitespace).len();
    let rest = &value[leading..];
    let marker_end = if rest.starts_with(['-', '*', '•', '●']) {
        rest.chars().next().map(char::len_utf8)
    } else {
        let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
        (digits > 0
            && rest
                .as_bytes()
                .get(digits)
                .is_some_and(|byte| matches!(byte, b'.' | b')')))
        .then_some(digits + 1)
    };
    let Some(marker_end) = marker_end else {
        return trim(value);
    };
    let whitespace = rest[marker_end..]
        .chars()
        .take_while(|character| is_ecmascript_whitespace(*character))
        .map(char::len_utf8)
        .sum::<usize>();
    if whitespace == 0 {
        return trim(value);
    }
    trim(&rest[marker_end + whitespace..])
}

fn empty_label(value: &str) -> &str {
    if value.is_empty() { "(empty)" } else { value }
}

fn limit_section(value: &str, maximum: usize) -> String {
    let length = utf16_len(value);
    if length <= maximum {
        return value.to_owned();
    }
    let kept = utf16_prefix(value, maximum);
    let omitted = length.saturating_sub(maximum);
    format!("{kept}\n\n[truncated: {omitted} characters omitted]")
}

fn truncate(value: &str, maximum: usize) -> String {
    truncate_diff(value, maximum)
}

fn truncate_diff(value: &str, maximum: usize) -> String {
    if utf16_len(value) <= maximum {
        return value.to_owned();
    }
    let sections = diff_sections(value);
    if sections.len() <= 1 {
        return clip_diff_section(value, maximum);
    }
    let allocations = allocate_diff_budget(
        &sections
            .iter()
            .map(|section| utf16_len(section))
            .collect::<Vec<_>>(),
        maximum,
    );
    sections
        .iter()
        .zip(allocations)
        .map(|(section, limit)| clip_diff_section(section, limit))
        .collect()
}

fn diff_sections(value: &str) -> Vec<&str> {
    let boundary = "\ndiff --git ";
    let mut sections = Vec::new();
    let mut start = 0;
    while let Some(relative) = value[start..].find(boundary) {
        let next = start + relative;
        sections.push(&value[start..=next]);
        start = next + 1;
    }
    sections.push(&value[start..]);
    sections
}

fn allocate_diff_budget(sizes: &[usize], maximum: usize) -> Vec<usize> {
    let mut allocations = vec![0; sizes.len()];
    let mut active = (0..sizes.len()).collect::<Vec<_>>();
    let mut remaining = maximum;
    while !active.is_empty() && remaining > 0 {
        let share = remaining / active.len();
        if share == 0 {
            break;
        }
        active.retain(|index| {
            let needed = sizes[*index].saturating_sub(allocations[*index]);
            let grant = needed.min(share);
            allocations[*index] += grant;
            remaining -= grant;
            grant < needed
        });
    }
    allocations
}

fn clip_diff_section(value: &str, maximum: usize) -> String {
    let length = utf16_len(value);
    if length <= maximum {
        return value.to_owned();
    }
    if maximum == 0 {
        return String::new();
    }
    let marker = |omitted| format!("\n...(diff truncated, {omitted} bytes omitted)\n");
    let initial_marker = marker(length);
    if utf16_len(&initial_marker) >= maximum {
        return utf16_prefix(&initial_marker, maximum).to_owned();
    }
    let target = maximum - utf16_len(&initial_marker);
    let target_prefix = utf16_prefix(value, target);
    let line_break = target_prefix
        .rfind('\n')
        .map(|index| utf16_len(&value[..index]));
    let cut = line_break
        .filter(|line| *line > target / 2)
        .unwrap_or(target);
    let final_marker = marker(length.saturating_sub(cut));
    let content_limit = cut.min(maximum.saturating_sub(utf16_len(&final_marker)));
    format!("{}{final_marker}", utf16_prefix(value, content_limit))
}
