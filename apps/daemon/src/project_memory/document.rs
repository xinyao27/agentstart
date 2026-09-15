/// Where an entry lands when the caller names no section.
pub(super) const DEFAULT_SECTION: &str = "Notes";

/// Longest single entry the daemon will record. Generous for a note, small enough that a runaway
/// agent cannot paste a whole transcript into the shared file.
pub(super) const MAX_ENTRY_BYTES: usize = 16 * 1024;

/// Ceiling for the whole document. Refusing the append keeps the failure visible instead of
/// silently dropping context the project already accumulated.
pub(super) const MAX_DOCUMENT_BYTES: usize = 1024 * 1024;

pub(super) fn header(display_name: &str, project_id: &str) -> String {
    format!(
        "# AgentStart project memory\n\
         \n\
         Shared context for this project. Every worktree and every agent reads this same\n\
         file, so append what the next agent should know instead of repeating it in a prompt.\n\
         \n\
         Project: {display_name}\n\
         Project id: {project_id}\n"
    )
}

pub(super) fn ensure_header(document: &str, display_name: &str, project_id: &str) -> String {
    if document.trim().is_empty() {
        header(display_name, project_id)
    } else {
        document.to_owned()
    }
}

/// Insert `- <stamp> <text>` at the end of `## <section>`, creating the section when the document
/// does not have it yet. Returns `None` when that text is already recorded under that heading, so
/// a retry after a lost response cannot duplicate it — comparing the rendered entry could never
/// detect that, because a retry carries a fresh stamp.
pub(super) fn append(document: &str, section: &str, stamp: &str, text: &str) -> Option<String> {
    let text = text.trim();
    if entry_texts(document, section)
        .iter()
        .any(|existing| existing == text)
    {
        return None;
    }
    let entry = render_entry(stamp, text);
    let mut lines = document.split('\n').map(str::to_owned).collect::<Vec<_>>();
    while lines.last().is_some_and(String::is_empty) {
        lines.pop();
    }
    let heading = format!("## {section}");
    let insert_at = match lines.iter().position(|line| line == &heading) {
        Some(start) => {
            let mut end = lines
                .iter()
                .skip(start + 1)
                .position(|line| line.starts_with("## "))
                .map_or(lines.len(), |offset| start + 1 + offset);
            while end > start + 1 && lines.get(end - 1).is_some_and(String::is_empty) {
                end -= 1;
            }
            end
        }
        None => {
            lines.push(String::new());
            lines.push(heading);
            lines.len()
        }
    };
    for (offset, line) in entry.lines().enumerate() {
        lines.insert(insert_at + offset, line.to_owned());
    }
    lines.push(String::new());
    Some(lines.join("\n"))
}

pub(super) fn entry_count(document: &str) -> i64 {
    let count = document
        .lines()
        .filter(|line| line.starts_with("- "))
        .count();
    i64::try_from(count).unwrap_or(i64::MAX)
}

/// The text of every entry recorded under `## <section>`, with the stamp stripped and continuation
/// lines folded back in — the form a duplicate check has to compare.
fn entry_texts(document: &str, section: &str) -> Vec<String> {
    let heading = format!("## {section}");
    let mut texts = Vec::new();
    let mut current: Option<String> = None;
    let mut in_section = false;
    for line in document.lines() {
        if line.starts_with("## ") {
            if in_section {
                break;
            }
            in_section = line == heading;
            continue;
        }
        if !in_section {
            continue;
        }
        if let Some(rest) = line.strip_prefix("- ") {
            if let Some(text) = current.take() {
                texts.push(text);
            }
            current = Some(
                rest.split_once(' ')
                    .map_or_else(|| rest.to_owned(), |(_, text)| text.to_owned()),
            );
        } else if let Some(text) = current.as_mut() {
            text.push('\n');
            text.push_str(line.trim_start());
        }
    }
    if let Some(text) = current {
        texts.push(text);
    }
    texts
}

/// Continuation lines are indented two spaces so every entry stays readable as one unit while an
/// entry always begins with `- ` at column zero — that is what `entry_count` counts.
fn render_entry(stamp: &str, text: &str) -> String {
    let mut lines = text.lines().map(str::trim_end);
    let mut rendered = format!("- {stamp} {}", lines.next().unwrap_or_default());
    for line in lines {
        rendered.push('\n');
        if !line.is_empty() {
            rendered.push_str("  ");
            rendered.push_str(line);
        }
    }
    rendered
}
