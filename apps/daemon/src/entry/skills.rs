use std::borrow::Cow;
use std::cmp::Ordering;
use std::ffi::OsString;
use std::sync::OnceLock;

use icu_collator::{Collator, CollatorBorrowed, options::CollatorOptions};
use icu_locale_core::Locale;
use serde::Serialize;

use crate::skills::{BundledSkillGuide, load_bundled_guides};

static ENGLISH_COLLATOR: OnceLock<Option<CollatorBorrowed<'static>>> = OnceLock::new();

#[derive(Serialize)]
struct SkillListOutput<'a> {
    topics: Vec<SkillTopic<'a>>,
}

#[derive(Serialize)]
struct SkillTopic<'a> {
    name: &'a str,
    description: String,
}

#[derive(Serialize)]
struct SkillGetOutput<'a> {
    name: &'a str,
    full: bool,
    markdown: &'a str,
}

pub(super) async fn run(args: &[OsString]) -> Result<(), String> {
    let mut guides = load_bundled_guides().await?;
    guides.sort_by(|left, right| compare_english(&left.name, &right.name));
    let command = argument(args, 0);
    match command.as_deref() {
        Some("list") => list(&guides, has_flag(args, "--json")),
        Some("get") => {
            let topic = argument(args, 1);
            get(
                &guides,
                topic.as_deref(),
                has_flag(args, "--full"),
                has_flag(args, "--json"),
            )
        }
        _ => Err("cli_command_unsupported:skills".to_owned()),
    }
}

fn list(guides: &[BundledSkillGuide], is_json: bool) -> Result<(), String> {
    let topics = guides
        .iter()
        .map(|guide| SkillTopic {
            name: &guide.name,
            description: collapse_whitespace(&guide.description),
        })
        .collect::<Vec<_>>();
    if is_json {
        let output = SkillListOutput { topics };
        println!(
            "{}",
            serde_json::to_string(&output)
                .map_err(|error| format!("skill_output_serialization_failed:{error}"))?
        );
    } else {
        println!(
            "{}",
            topics
                .iter()
                .map(|topic| format!("{}: {}", topic.name, topic.description))
                .collect::<Vec<_>>()
                .join("\n")
        );
    }
    Ok(())
}

fn get(
    guides: &[BundledSkillGuide],
    topic: Option<&str>,
    full: bool,
    is_json: bool,
) -> Result<(), String> {
    let topic = topic
        .filter(|topic| !topic.starts_with("--"))
        .ok_or_else(|| "A skill name is required".to_owned())?;
    let guide = guides
        .iter()
        .find(|guide| guide.name == topic || guide.aliases.iter().any(|alias| alias == topic))
        .ok_or_else(|| {
            format!(
                "Unknown skill {topic}. Available skills: {}",
                guides
                    .iter()
                    .map(|guide| guide.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })?;
    let markdown = if full {
        &guide.full_markdown
    } else {
        &guide.markdown
    };
    if is_json {
        println!(
            "{}",
            serde_json::to_string(&SkillGetOutput {
                name: &guide.name,
                full,
                markdown,
            })
            .map_err(|error| format!("skill_output_serialization_failed:{error}"))?
        );
    } else {
        println!("{markdown}");
    }
    Ok(())
}

fn argument(args: &[OsString], index: usize) -> Option<Cow<'_, str>> {
    args.get(index).map(|argument| argument.to_string_lossy())
}

fn has_flag(args: &[OsString], flag: &str) -> bool {
    args.iter().any(|argument| argument == flag)
}

fn compare_english(left: &str, right: &str) -> Ordering {
    ENGLISH_COLLATOR
        .get_or_init(english_collator)
        .as_ref()
        .map_or_else(|| left.cmp(right), |collator| collator.compare(left, right))
}

fn english_collator() -> Option<CollatorBorrowed<'static>> {
    let locale = "en".parse::<Locale>().ok()?;
    Collator::try_new((&locale).into(), CollatorOptions::default()).ok()
}

fn collapse_whitespace(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    for part in value
        .split(is_ecmascript_whitespace)
        .filter(|part| !part.is_empty())
    {
        if !normalized.is_empty() {
            normalized.push(' ');
        }
        normalized.push_str(part);
    }
    normalized
}

fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'
            ..='\u{000d}'
                | '\u{0020}'
                | '\u{00a0}'
                | '\u{1680}'
                | '\u{2000}'..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}
