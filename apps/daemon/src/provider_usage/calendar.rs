use chrono::{DateTime, Days, Local, NaiveDate};

pub(super) fn range_cutoff(range: &str) -> Option<String> {
    let days = match range {
        "7d" => 6,
        "30d" => 29,
        "90d" => 89,
        _ => return None,
    };
    cutoff_on(Local::now().date_naive(), days)
}

fn cutoff_on(today: NaiveDate, days: u64) -> Option<String> {
    today
        .checked_sub_days(Days::new(days))
        .map(|day| day.format("%Y-%m-%d").to_string())
}

pub(super) fn local_day(timestamp: &str) -> Option<String> {
    DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .map(|value| value.with_timezone(&Local).format("%Y-%m-%d").to_string())
}

pub(super) fn duration_minutes(first: &str, last: &str) -> u64 {
    let (Ok(first), Ok(last)) = (
        DateTime::parse_from_rfc3339(first),
        DateTime::parse_from_rfc3339(last),
    ) else {
        return 0;
    };
    ((last - first).num_milliseconds().max(0) as f64 / 60_000.0).round() as u64
}
