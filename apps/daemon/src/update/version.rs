#[derive(Clone, Debug, Eq, PartialEq)]
struct Version {
    core: [u64; 3],
    prerelease: Option<Vec<Identifier>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum Identifier {
    Numeric(u64),
    Text(String),
}

pub(super) fn release_version(tag: Option<&str>) -> Option<String> {
    let value = tag?.strip_prefix('v')?;
    parse(value)?;
    Some(value.to_owned())
}

pub(super) fn is_newer(left: &str, right: &str) -> bool {
    let Some(left) = parse(left.strip_prefix('v').unwrap_or(left)) else {
        return false;
    };
    let Some(right) = parse(right.strip_prefix('v').unwrap_or(right)) else {
        return false;
    };
    compare(&left, &right).is_gt()
}

pub(super) fn compare_versions(left: &str, right: &str) -> Option<std::cmp::Ordering> {
    Some(compare(
        &parse(left.strip_prefix('v').unwrap_or(left))?,
        &parse(right.strip_prefix('v').unwrap_or(right))?,
    ))
}

pub(super) fn is_perf(value: &str) -> bool {
    parse(value.strip_prefix('v').unwrap_or(value))
        .and_then(|version| version.prerelease)
        .is_some_and(|identifiers| {
            identifiers.iter().any(|identifier| {
                matches!(identifier, Identifier::Text(value) if value.eq_ignore_ascii_case("perf"))
            })
        })
}

pub(super) fn is_prerelease(value: &str) -> bool {
    parse(value.strip_prefix('v').unwrap_or(value))
        .is_some_and(|version| version.prerelease.is_some())
}

pub(super) fn is_valid(value: &str) -> bool {
    parse(value.strip_prefix('v').unwrap_or(value)).is_some()
}

fn parse(value: &str) -> Option<Version> {
    let (precedence, build) = value
        .split_once('+')
        .map_or((value, None), |(precedence, build)| {
            (precedence, Some(build))
        });
    if build.is_some_and(|build| !valid_identifiers(build)) {
        return None;
    }
    let (core, prerelease) = precedence
        .split_once('-')
        .map_or((precedence, None), |(core, prerelease)| {
            (core, Some(prerelease))
        });
    let mut parts = core.split('.');
    let core = [
        numeric_core(parts.next()?)?,
        numeric_core(parts.next()?)?,
        numeric_core(parts.next()?)?,
    ];
    if parts.next().is_some() {
        return None;
    }
    let prerelease = match prerelease {
        Some(prerelease) => Some(parse_prerelease(prerelease)?),
        None => None,
    };
    Some(Version { core, prerelease })
}

fn numeric_core(value: &str) -> Option<u64> {
    if value.is_empty()
        || !value.bytes().all(|byte| byte.is_ascii_digit())
        || value.len() > 1 && value.starts_with('0')
    {
        return None;
    }
    value.parse().ok()
}

fn parse_prerelease(value: &str) -> Option<Vec<Identifier>> {
    if !valid_identifiers(value) {
        return None;
    }
    value
        .split('.')
        .map(|identifier| {
            if identifier.bytes().all(|byte| byte.is_ascii_digit()) {
                if identifier.len() > 1 && identifier.starts_with('0') {
                    return None;
                }
                identifier.parse().ok().map(Identifier::Numeric)
            } else {
                Some(Identifier::Text(identifier.to_owned()))
            }
        })
        .collect()
}

fn valid_identifiers(value: &str) -> bool {
    !value.is_empty()
        && value.split('.').all(|identifier| {
            !identifier.is_empty()
                && identifier
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
}

fn compare(left: &Version, right: &Version) -> std::cmp::Ordering {
    let core = left.core.cmp(&right.core);
    if !core.is_eq() {
        return core;
    }
    match (&left.prerelease, &right.prerelease) {
        (None, None) => std::cmp::Ordering::Equal,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (Some(_), None) => std::cmp::Ordering::Less,
        (Some(left), Some(right)) => compare_prerelease(left, right),
    }
}

fn compare_prerelease(left: &[Identifier], right: &[Identifier]) -> std::cmp::Ordering {
    for (left, right) in left.iter().zip(right) {
        let ordering = match (left, right) {
            (Identifier::Numeric(left), Identifier::Numeric(right)) => left.cmp(right),
            (Identifier::Numeric(_), Identifier::Text(_)) => std::cmp::Ordering::Less,
            (Identifier::Text(_), Identifier::Numeric(_)) => std::cmp::Ordering::Greater,
            (Identifier::Text(left), Identifier::Text(right)) => left.cmp(right),
        };
        if !ordering.is_eq() {
            return ordering;
        }
    }
    left.len().cmp(&right.len())
}
