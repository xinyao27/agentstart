use std::path::PathBuf;

use serde::Deserialize;
use tokio::fs;

const EMBEDDED_SKILL_GUIDES: &[u8] = include_bytes!(concat!(
    env!("OUT_DIR"),
    "/skill-resources/skill-guides.json"
));

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct BundledSkillGuide {
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) markdown: String,
    pub(crate) full_markdown: String,
    pub(crate) aliases: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct GuideCollection {
    schema_version: u64,
    guides: Vec<BundledSkillGuide>,
}

pub(crate) async fn load() -> Result<Vec<BundledSkillGuide>, String> {
    let collection = if let Some(root) = std::env::var_os("YIRU_SKILL_RESOURCES_DIR") {
        let path = PathBuf::from(root).join("skill-guides.json");
        let bytes = fs::read(&path)
            .await
            .map_err(|error| format!("{}: {error}", path.display()))?;
        parse(&bytes)?
    } else {
        parse(EMBEDDED_SKILL_GUIDES)?
    };
    validate(collection)
}

fn parse(bytes: &[u8]) -> Result<GuideCollection, String> {
    serde_json::from_slice(bytes).map_err(|error| format!("skill_guides_invalid:{error}"))
}

fn validate(collection: GuideCollection) -> Result<Vec<BundledSkillGuide>, String> {
    if collection.schema_version != 1 {
        return Err("skill_guides_invalid:schema mismatch".to_owned());
    }
    let is_valid = collection.guides.iter().all(|guide| {
        !guide.name.is_empty()
            && !guide.description.is_empty()
            && !guide.markdown.is_empty()
            && !guide.full_markdown.is_empty()
            && guide.aliases.iter().all(|alias| !alias.is_empty())
    });
    if !is_valid {
        return Err("skill_guides_invalid:schema mismatch".to_owned());
    }
    Ok(collection.guides)
}
