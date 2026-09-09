use serde_json::Value;
use yiru_protocol::runtime::v1::emulator_json_value::Kind;
use yiru_protocol::runtime::v1::{
    EmulatorDeviceInfo, EmulatorJsonNull, EmulatorJsonValue, EmulatorJsonValueEntry,
    EmulatorJsonValueList, EmulatorJsonValueObject, EmulatorSessionInfo,
};

use crate::emulator::{DeviceRecord, EmulatorSession};

pub(super) fn device_info(device: &DeviceRecord) -> EmulatorDeviceInfo {
    EmulatorDeviceInfo {
        name: device.name.clone(),
        udid: device.udid.clone(),
        state: device.state.clone(),
        runtime: device.runtime.clone(),
        is_available: device.is_available,
    }
}

pub(super) fn session_info(session: EmulatorSession) -> EmulatorSessionInfo {
    EmulatorSessionInfo {
        device_udid: session.device_udid,
        ws_url: session.ws_url,
        stream_url: session.stream_url,
        ax_url: session.ax_url,
        helper_pid: session.pid,
    }
}

// Why: `emulator list`/`emulator exec` surface the serve-sim helper's own
// JSON verbatim, whose shape is owned by that external tool rather than this
// daemon, so it is carried as a typed recursive value instead of assuming a
// schema we do not control. Mirrors ComputerJsonValue's json_value in
// rpc/computer/response.rs.
pub(super) fn json_value(value: &Value) -> EmulatorJsonValue {
    let kind = match value {
        Value::Null => Kind::NullValue(EmulatorJsonNull::Value as i32),
        Value::Bool(flag) => Kind::BoolValue(*flag),
        Value::Number(number) => Kind::NumberValue(number.as_f64().unwrap_or_default()),
        Value::String(text) => Kind::StringValue(text.clone()),
        Value::Array(items) => Kind::ListValue(EmulatorJsonValueList {
            values: items.iter().map(json_value).collect(),
        }),
        Value::Object(entries) => Kind::ObjectValue(EmulatorJsonValueObject {
            entries: entries
                .iter()
                .map(|(key, value)| EmulatorJsonValueEntry {
                    key: key.clone(),
                    value: Some(json_value(value)),
                })
                .collect(),
        }),
    };
    EmulatorJsonValue { kind: Some(kind) }
}
