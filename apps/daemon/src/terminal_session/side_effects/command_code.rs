use super::{TerminalSideEffect, text::tail};
use regex::Regex;
use std::sync::LazyLock;

static ANSI: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|[@-Z\\-_])")
        .expect("constant ANSI pattern")
});
static INCOMPLETE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\x1b(?:\[[0-?]*[ -/]*|\][^\x07\x1b]*|\S?)?$")
        .expect("constant incomplete ANSI pattern")
});
static BANNER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bCommand Code\b").expect("constant banner pattern"));
static IDLE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:^|[\r\n])\s*[❯>]\s+Ask your question\.\.\.").expect("constant idle pattern")
});
static PROMPT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:^|[\r\n])\s*[❯>]\s+([^\r\n]+)[\r\n]").expect("constant prompt pattern")
});
static LAUNCH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:^|[\s;&|])(?:command-code|commandcode|cmdc)(?:\s|$)")
        .expect("constant launch pattern")
});
static ORPHAN_SGR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[(?:\d{1,3}(?:;\d{1,3})*)?m").expect("constant orphan SGR pattern")
});
static ACTIVE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(r"(?:^|[\r\n])\s*(?:[·○◇☆✧⌘✻⎿]\s*)?(?:(?:", "Thinking|Pondering|Contemplating|Reasoning|Reflecting|Considering|Deliberating|Analyzing|Evaluating|Examining|Inspecting|Investigating|Reviewing|Researching|Studying|Exploring|Mapping|Tracing|Parsing|Processing|Calculating|Computing|Synthesizing|Planning|Outlining|Sketching|Drafting|Composing|Crafting|Building|Assembling|Constructing|Designing|Formulating|Structuring|Organizing|Preparing|Refining|Polishing|Honing|Tuning|Aligning|Connecting|Resolving|Weaving|Threading|Sculpting|Crystallizing|Channeling|Conjuring|Brewing|Working|Cogitating|Ruminating|Hypothesizing|Conceptualizing|Philosophizing|Deciphering|Demystifying|Articulating|Illuminating|Elaborating|Orchestrating|Choreographing|Architecting|Calibrating|Materializing|Visualizing|Harmonizing|Contemplificating|Supercalifragilisting|Bibbidibobbidibooing|Abracadabraing|Hocuspocusing|Razzmatazzing", r")\b(?:…|\.\.\.)|Executing:\s+\S|Running\s*\()" )).expect("constant active status pattern")
});

pub(super) struct CommandCodeScanner {
    armed: bool,
    prompt: String,
    recent: String,
}

impl CommandCodeScanner {
    pub(super) fn new(command: Option<&str>) -> Self {
        Self {
            armed: command.is_some_and(|command| LAUNCH.is_match(command)),
            prompt: String::new(),
            recent: String::new(),
        }
    }

    pub(super) fn observe(&mut self, text: &str) -> Vec<TerminalSideEffect> {
        let previous = std::mem::take(&mut self.recent);
        self.recent = tail(&format!("{previous}{text}"), 300).to_owned();
        let raw = scan_window(&previous, text);
        let raw_boundary = if previous.is_empty() {
            raw.clone()
        } else {
            scan_window(&format!("{previous}\n"), text)
        };
        if !self.armed
            && ![&raw, &raw_boundary]
                .iter()
                .any(|raw| raw.contains('C') && raw.contains('o') && raw.contains('d'))
        {
            return Vec::new();
        }
        let clean = strip_control(&raw);
        let clean_boundary = strip_control(&raw_boundary);
        if !self.armed {
            if !BANNER.is_match(&clean) && !BANNER.is_match(&clean_boundary) {
                return Vec::new();
            }
            self.armed = true;
        }
        let previous_len = strip_control(&previous).len();
        let previous_boundary_len = if previous.is_empty() {
            0
        } else {
            strip_control(&format!("{previous}\n")).len()
        };
        for capture in PROMPT.captures_iter(&clean) {
            let prompt = capture[1].split_whitespace().collect::<Vec<_>>().join(" ");
            let without_sgr = ORPHAN_SGR.replace_all(&prompt, "");
            let compact: String = without_sgr
                .chars()
                .filter(|character| !character.is_whitespace())
                .collect();
            if !prompt.is_empty() && compact != "Askyourquestion..." {
                self.prompt = prompt;
            }
        }
        let overlaps = |pattern: &Regex| {
            pattern
                .find_iter(&clean)
                .any(|matched| matched.end() > previous_len)
                || pattern
                    .find_iter(&clean_boundary)
                    .any(|matched| matched.end() > previous_boundary_len)
        };
        if overlaps(&ACTIVE) {
            return vec![TerminalSideEffect::CommandCodeWorking {
                prompt: self.prompt.clone(),
            }];
        }
        if !self.prompt.is_empty() && overlaps(&IDLE) {
            return vec![TerminalSideEffect::CommandCodeDone {
                prompt: self.prompt.clone(),
            }];
        }
        Vec::new()
    }
}

fn strip_control(text: &str) -> String {
    let ansi = ANSI.replace_all(text, "");
    INCOMPLETE
        .replace_all(&ansi, "")
        .chars()
        .filter(|character| matches!(character, '\n' | '\r') || !character.is_control())
        .collect()
}

fn scan_window(previous: &str, text: &str) -> String {
    let previous = tail(previous, 301);
    let budget = 4_096 - previous.chars().count();
    if text.chars().count() <= budget {
        return format!("{previous}{text}");
    }
    let head: String = text.chars().take((budget - 1) / 2).collect();
    let tail = tail(text, budget - (budget - 1) / 2 - 1);
    format!("{previous}{head}\n{tail}")
}
