#![forbid(unsafe_code)]

pub mod protocol {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/yiru.protocol.v1.rs"));
    }
}

pub mod runtime {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/yiru.runtime.v1.rs"));
    }
}

pub mod method_metadata {
    include!(concat!(env!("OUT_DIR"), "/yiru.method_metadata.rs"));
}

pub mod transport;

pub const CURRENT_PROTOCOL_VERSION: u32 = protocol::v1::ProtocolVersion::V2 as u32;
pub const MIN_COMPATIBLE_PROTOCOL_VERSION: u32 = protocol::v1::ProtocolVersion::V2 as u32;
