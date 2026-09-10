use std::time::{Duration, Instant};

use url::Url;

use super::EmulatorError;

const MAX_PENDING_BYTES: usize = 2 * 1024 * 1024;
const MIN_FRAME_INTERVAL: Duration = Duration::from_millis(33);

pub(crate) fn stream_url(stream_url: &str, stream_key: Option<&str>) -> Result<Url, EmulatorError> {
    let mut url: Url = stream_url
        .parse()
        .map_err(|_| EmulatorError::domain("emulator_error", "Simulator stream URL is invalid."))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(EmulatorError::domain(
            "emulator_error",
            "Simulator stream must use http or https.",
        ));
    }
    if !url.path().ends_with("/stream.mjpeg") {
        return Err(EmulatorError::domain(
            "emulator_error",
            "Simulator stream must target stream.mjpeg.",
        ));
    }
    url.query_pairs_mut().append_pair("raw", "1");
    if let Some(stream_key) = stream_key {
        url.query_pairs_mut().append_pair("_agentstart", stream_key);
    }
    Ok(url)
}

/// Splits `pending` into complete, rate-limited JPEG frames (SOI..EOI marker
/// pairs) ready to send, draining each one out of `pending` as it is taken.
/// Pure and transport-agnostic — the protobuf `StreamFrames` handler drains
/// frames asynchronously — so the MJPEG framing and frame-rate throttle exist
/// exactly once.
pub(crate) fn extract_frames(
    pending: &mut Vec<u8>,
    last_frame: &mut Option<Instant>,
) -> Vec<Vec<u8>> {
    let mut frames = Vec::new();
    loop {
        let Some(start) = find_bytes(pending, &[0xff, 0xd8], 0) else {
            let keep_ff = pending.last() == Some(&0xff);
            pending.clear();
            if keep_ff {
                pending.push(0xff);
            }
            return frames;
        };
        if start > 0 {
            pending.drain(..start);
        }
        let Some(end) = find_bytes(pending, &[0xff, 0xd9], 2) else {
            if pending.len() > MAX_PENDING_BYTES {
                pending.drain(..pending.len() - MAX_PENDING_BYTES);
            }
            return frames;
        };
        let frame_end = end + 2;
        let now = Instant::now();
        let throttled =
            last_frame.is_some_and(|previous| now.duration_since(previous) < MIN_FRAME_INTERVAL);
        if !throttled {
            *last_frame = Some(now);
            frames.push(pending[..frame_end].to_vec());
        }
        pending.drain(..frame_end);
    }
}

fn find_bytes(haystack: &[u8], needle: &[u8], start: usize) -> Option<usize> {
    haystack
        .get(start..)?
        .windows(needle.len())
        .position(|window| window == needle)
        .map(|position| position + start)
}
