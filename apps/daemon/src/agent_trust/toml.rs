use super::toml_scan::{ScanState, lines};
use super::toml_syntax::{
    escape_string, is_table_header, is_trust_assignment, lookup_path, parse_project_header,
};

pub(super) fn upsert_project_trust(content: &str, project_path: &str) -> String {
    let content = content.strip_prefix('\u{feff}').unwrap_or(content);
    let eol = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    if let Some((header_end, block_end)) = find_project_block(content, project_path) {
        let block = &content[header_end..block_end];
        if let Some((start, end)) = find_trust_line(block) {
            return format!(
                "{}trust_level = \"trusted\"{}",
                &content[..header_end + start],
                &content[header_end + end..]
            );
        }
        return format!(
            "{}{}trust_level = \"trusted\"{}",
            &content[..header_end],
            eol,
            &content[header_end..]
        );
    }
    let block = format!(
        "[projects.\"{}\"]{eol}trust_level = \"trusted\"{eol}",
        escape_string(project_path)
    );
    if content.is_empty() {
        return block;
    }
    let separator = if content.ends_with(&format!("{eol}{eol}")) {
        ""
    } else if content.ends_with(eol) {
        eol
    } else {
        return format!("{content}{eol}{eol}{block}");
    };
    format!("{content}{separator}{block}")
}

fn find_project_block(content: &str, project_path: &str) -> Option<(usize, usize)> {
    let mut state = ScanState::default();
    let mut matching_header_end = None;
    for line in lines(content) {
        if state.is_structural() && is_table_header(line.text) {
            if matching_header_end.is_some() {
                return matching_header_end.map(|header_end| (header_end, line.start));
            }
            if parse_project_header(line.text)
                .is_some_and(|path| lookup_path(&path) == lookup_path(project_path))
            {
                matching_header_end = Some(line.end);
            }
        }
        state.scan_line(line.text);
    }
    matching_header_end.map(|header_end| (header_end, content.len()))
}

fn find_trust_line(block: &str) -> Option<(usize, usize)> {
    let mut state = ScanState::default();
    for line in lines(block) {
        if state.is_structural() && is_trust_assignment(line.text) {
            return Some((line.start, line.end));
        }
        state.scan_line(line.text);
    }
    None
}
