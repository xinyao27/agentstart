// Why: Prost does not emit Yiru method-policy metadata needed by the daemon dispatcher.
#![forbid(unsafe_code)]

use std::collections::HashSet;
use std::env;
use std::error::Error;
use std::fmt::Write as _;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use heck::{ToSnakeCase, ToUpperCamelCase};
use prost_reflect::{DescriptorPool, DynamicMessage, Kind, MessageDescriptor, ReflectMessage};

const METHOD_METADATA_FILE: &str = "yiru.method_metadata.rs";
const METHOD_POLICY_EXTENSION: &str = "yiru.protocol.v1.method_policy";
const METHOD_TRANSPORT_POLICY_EXTENSION: &str = "yiru.protocol.v1.method_transport_policy";
const STREAM_RECONNECT_RESTART_FROM_REQUEST: i32 = 2;

struct MethodRecord {
    callers: Vec<i32>,
    client_streaming: bool,
    id: String,
    peer_kinds: Vec<i32>,
    procedure: String,
    request_type: String,
    route: i32,
    scope: i32,
    server_streaming: bool,
    stream_reconnect: i32,
    tier: i32,
    response_type: String,
}

fn main() -> Result<(), Box<dyn Error>> {
    let crate_root = PathBuf::from(required_env_path("CARGO_MANIFEST_DIR")?);
    let output_root = PathBuf::from(required_env_path("OUT_DIR")?);
    let proto_root = crate_root.join("..").join("proto");
    let mut protos = Vec::new();
    collect_protos(&proto_root, &mut protos)?;
    protos.sort();
    if protos.is_empty() {
        return Err(invalid_data("Protocol package contains no .proto schemas").into());
    }

    println!("cargo:rerun-if-changed={}", proto_root.display());
    let descriptor_path = output_root.join("yiru.file_descriptor_set.bin");
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    let mut config = prost_build::Config::new();
    config.protoc_executable(protoc);
    config.file_descriptor_set_path(&descriptor_path);
    let descriptors = config.load_fds(&protos, &[&proto_root])?;
    let descriptor_bytes = fs::read(&descriptor_path)?;
    let pool = DescriptorPool::decode(descriptor_bytes.as_slice())?;
    let metadata = generate_method_metadata(&pool)?;
    fs::write(output_root.join(METHOD_METADATA_FILE), metadata)?;
    config.compile_fds(descriptors)?;
    Ok(())
}

fn required_env_path(name: &str) -> io::Result<std::ffi::OsString> {
    env::var_os(name).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            format!("{name} is unavailable during protocol generation"),
        )
    })
}

fn collect_protos(directory: &Path, protos: &mut Vec<PathBuf>) -> io::Result<()> {
    let entries = fs::read_dir(directory)?;
    for entry in entries {
        let path = entry?.path();
        if path.is_dir() {
            collect_protos(&path, protos)?;
        } else if path
            .extension()
            .is_some_and(|extension| extension == "proto")
        {
            protos.push(path);
        }
    }
    Ok(())
}

fn generate_method_metadata(pool: &DescriptorPool) -> Result<String, Box<dyn Error>> {
    let policy_extension = pool
        .get_extension_by_name(METHOD_POLICY_EXTENSION)
        .ok_or_else(|| invalid_data("Method policy extension is absent from descriptors"))?;
    let transport_policy_extension = pool
        .get_extension_by_name(METHOD_TRANSPORT_POLICY_EXTENSION)
        .ok_or_else(|| {
            invalid_data("Method transport policy extension is absent from descriptors")
        })?;
    let mut records = Vec::new();
    for service in pool
        .services()
        .filter(|service| service.package_name().starts_with("yiru."))
    {
        for method in service.methods() {
            let options = method.options();
            if !options.has_extension(&policy_extension) {
                return Err(invalid_data(&format!(
                    "{} has no Yiru method policy",
                    method.full_name()
                ))
                .into());
            }
            let policy_value = options.get_extension(&policy_extension);
            let policy = policy_value.as_message().ok_or_else(|| {
                invalid_data(&format!(
                    "{} has a malformed Yiru method policy",
                    method.full_name()
                ))
            })?;
            if !options.has_extension(&transport_policy_extension) {
                return Err(invalid_data(&format!(
                    "{} has no Yiru method transport policy",
                    method.full_name()
                ))
                .into());
            }
            let transport_policy_value = options.get_extension(&transport_policy_extension);
            let transport_policy = transport_policy_value.as_message().ok_or_else(|| {
                invalid_data(&format!(
                    "{} has a malformed Yiru method transport policy",
                    method.full_name()
                ))
            })?;
            let stream_reconnect =
                required_enum(transport_policy, "stream_reconnect", method.full_name())?;
            if stream_reconnect == STREAM_RECONNECT_RESTART_FROM_REQUEST
                && (!method.is_server_streaming() || method.is_client_streaming())
            {
                return Err(invalid_data(&format!(
                    "{} restarts from its request but is not a server-only stream",
                    method.full_name()
                ))
                .into());
            }
            records.push(MethodRecord {
                callers: required_enum_list(policy, "callers", method.full_name())?,
                client_streaming: method.is_client_streaming(),
                id: method.full_name().to_upper_camel_case(),
                peer_kinds: enum_list(policy, "peer_kinds", method.full_name())?,
                procedure: format!("/{}/{}", service.full_name(), method.name()),
                request_type: rust_message_path(method.input())?,
                route: required_enum(transport_policy, "route", method.full_name())?,
                scope: required_enum(policy, "scope", method.full_name())?,
                server_streaming: method.is_server_streaming(),
                stream_reconnect,
                tier: required_enum(policy, "tier", method.full_name())?,
                response_type: rust_message_path(method.output())?,
            });
        }
    }
    if records.is_empty() {
        return Err(invalid_data("Protocol descriptors contain no Yiru service methods").into());
    }
    records.sort_by(|left, right| left.procedure.cmp(&right.procedure));
    validate_unique_methods(&records)?;
    render_method_metadata(&records).map_err(Into::into)
}

fn required_enum(message: &DynamicMessage, field: &str, method: &str) -> io::Result<i32> {
    let value = message
        .get_field_by_name(field)
        .and_then(|value| value.as_enum_number())
        .ok_or_else(|| invalid_data(&format!("{method} policy has no {field}")))?;
    if value == 0 || !enum_value_exists(message, field, value)? {
        return Err(invalid_data(&format!(
            "{method} policy has invalid {field} value {value}"
        )));
    }
    Ok(value)
}

fn required_enum_list(message: &DynamicMessage, field: &str, method: &str) -> io::Result<Vec<i32>> {
    let values = enum_list(message, field, method)?;
    if values.is_empty() {
        return Err(invalid_data(&format!("{method} policy permits no callers")));
    }
    Ok(values)
}

fn enum_list(message: &DynamicMessage, field: &str, method: &str) -> io::Result<Vec<i32>> {
    let value = message
        .get_field_by_name(field)
        .ok_or_else(|| invalid_data(&format!("{method} policy has no {field}")))?;
    let values = value
        .as_list()
        .ok_or_else(|| invalid_data(&format!("{method} policy {field} is not a list")))?;
    values
        .iter()
        .map(|value| {
            let number = value.as_enum_number().ok_or_else(|| {
                invalid_data(&format!("{method} policy {field} contains a non-enum"))
            })?;
            if number == 0 || !enum_value_exists(message, field, number)? {
                return Err(invalid_data(&format!(
                    "{method} policy has invalid {field} value {number}"
                )));
            }
            Ok(number)
        })
        .collect()
}

fn enum_value_exists(message: &DynamicMessage, field: &str, value: i32) -> io::Result<bool> {
    let descriptor = message
        .descriptor()
        .get_field_by_name(field)
        .ok_or_else(|| invalid_data(&format!("MethodPolicy has no {field} field")))?;
    let Kind::Enum(values) = descriptor.kind() else {
        return Err(invalid_data(&format!(
            "MethodPolicy {field} field is not an enum"
        )));
    };
    Ok(values.get_value(value).is_some())
}

fn validate_unique_methods(records: &[MethodRecord]) -> io::Result<()> {
    let mut ids = HashSet::new();
    let mut procedures = HashSet::new();
    for record in records {
        if !ids.insert(record.id.as_str()) {
            return Err(invalid_data(&format!(
                "Generated method id {} is duplicated",
                record.id
            )));
        }
        if !procedures.insert(record.procedure.as_str()) {
            return Err(invalid_data(&format!(
                "Generated procedure {} is duplicated",
                record.procedure
            )));
        }
    }
    Ok(())
}

fn rust_message_path(message: MessageDescriptor) -> io::Result<String> {
    let package = message.package_name().to_owned();
    let Some(package) = package.strip_prefix("yiru.") else {
        return Err(invalid_data(&format!(
            "{} is outside the yiru package tree",
            message.full_name()
        )));
    };
    let mut messages = Vec::new();
    let mut current = Some(message);
    while let Some(descriptor) = current {
        messages.push(descriptor.name().to_owned());
        current = descriptor.parent_message();
    }
    messages.reverse();
    let Some((message, parents)) = messages.split_last() else {
        return Err(invalid_data("Protocol method message has no name"));
    };
    let mut path = format!("crate::{}", package.replace('.', "::"));
    for parent in parents {
        write!(path, "::{}", parent.to_snake_case())
            .map_err(|_| invalid_data("Rust message path cannot be rendered"))?;
    }
    write!(path, "::{}", message.to_upper_camel_case())
        .map_err(|_| invalid_data("Rust message path cannot be rendered"))?;
    Ok(path)
}

fn render_method_metadata(records: &[MethodRecord]) -> Result<String, std::fmt::Error> {
    let mut output = String::new();
    output.push_str("#[derive(Clone, Copy, Debug, Eq, PartialEq)]\n");
    output.push_str("pub enum MethodId {\n");
    for record in records {
        writeln!(output, "    {},", record.id)?;
    }
    output.push_str("}\n\n");
    output.push_str("#[derive(Clone, Copy, Debug)]\n");
    output.push_str("pub struct MethodMetadata {\n");
    output.push_str("    pub id: MethodId,\n");
    output.push_str("    pub procedure: &'static str,\n");
    output.push_str("    pub scope: i32,\n");
    output.push_str("    pub tier: i32,\n");
    output.push_str("    pub callers: &'static [i32],\n");
    output.push_str("    pub peer_kinds: &'static [i32],\n");
    output.push_str("    pub route: i32,\n");
    output.push_str("    pub stream_reconnect: i32,\n");
    output.push_str("    pub client_streaming: bool,\n");
    output.push_str("    pub server_streaming: bool,\n");
    output.push_str("}\n\n");
    output.push_str("mod sealed {\n");
    output.push_str("    pub trait ProtocolMethod {}\n");
    output.push_str("}\n\n");
    output.push_str("pub trait ProtocolMethod: sealed::ProtocolMethod {\n");
    output.push_str("    type Request: ::prost::Message;\n");
    output.push_str("    const METADATA: &'static MethodMetadata;\n");
    output.push_str("}\n\n");
    output.push_str("pub trait UnaryMethod: ProtocolMethod {\n");
    output.push_str("    type Response: ::prost::Message + Default;\n");
    output.push_str("}\n\n");
    output.push_str("pub trait ServerStreamMethod: ProtocolMethod {\n");
    output.push_str("    type Item: ::prost::Message + Default;\n");
    output.push_str("}\n\n");
    output.push_str("pub const METHODS: &[MethodMetadata] = &[\n");
    for record in records {
        output.push_str("    MethodMetadata {\n");
        writeln!(output, "        id: MethodId::{},", record.id)?;
        writeln!(output, "        procedure: {:?},", record.procedure)?;
        writeln!(output, "        scope: {},", record.scope)?;
        writeln!(output, "        tier: {},", record.tier)?;
        writeln!(output, "        callers: &{:?},", record.callers)?;
        writeln!(output, "        peer_kinds: &{:?},", record.peer_kinds)?;
        writeln!(output, "        route: {},", record.route)?;
        writeln!(
            output,
            "        stream_reconnect: {},",
            record.stream_reconnect
        )?;
        writeln!(
            output,
            "        client_streaming: {},",
            record.client_streaming
        )?;
        writeln!(
            output,
            "        server_streaming: {},",
            record.server_streaming
        )?;
        output.push_str("    },\n");
    }
    output.push_str("];\n\n");
    output.push_str("pub mod methods {\n");
    for (index, record) in records.iter().enumerate() {
        writeln!(output, "    pub struct {};", record.id)?;
        writeln!(
            output,
            "    impl super::sealed::ProtocolMethod for {} {{}}",
            record.id
        )?;
        writeln!(
            output,
            "    impl super::ProtocolMethod for {} {{",
            record.id
        )?;
        writeln!(output, "        type Request = {};", record.request_type)?;
        writeln!(
            output,
            "        const METADATA: &'static super::MethodMetadata = &super::METHODS[{index}];"
        )?;
        output.push_str("    }\n");
        if !record.client_streaming && record.server_streaming {
            writeln!(
                output,
                "    impl super::ServerStreamMethod for {} {{",
                record.id
            )?;
            writeln!(output, "        type Item = {};", record.response_type)?;
            output.push_str("    }\n");
        } else if !record.client_streaming {
            writeln!(output, "    impl super::UnaryMethod for {} {{", record.id)?;
            writeln!(output, "        type Response = {};", record.response_type)?;
            output.push_str("    }\n");
        }
    }
    output.push_str("}\n\n");
    output
        .push_str("pub fn method_metadata(procedure: &str) -> Option<&'static MethodMetadata> {\n");
    output.push_str("    match procedure {\n");
    for (index, record) in records.iter().enumerate() {
        writeln!(
            output,
            "        {:?} => Some(&METHODS[{index}]),",
            record.procedure
        )?;
    }
    output.push_str("        _ => None,\n");
    output.push_str("    }\n");
    output.push_str("}\n");
    output.push('\n');
    output.push_str("pub fn method_metadata_by_id(id: MethodId) -> &'static MethodMetadata {\n");
    output.push_str("    match id {\n");
    for (index, record) in records.iter().enumerate() {
        writeln!(
            output,
            "        MethodId::{} => &METHODS[{index}],",
            record.id
        )?;
    }
    output.push_str("    }\n");
    output.push_str("}\n");
    Ok(output)
}

fn invalid_data(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
