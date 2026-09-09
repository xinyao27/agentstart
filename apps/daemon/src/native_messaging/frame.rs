use std::io::{self, Read, Write};

use thiserror::Error;

const MAX_MESSAGE_BYTES: usize = 1024 * 1024;

#[derive(Debug, Error)]
pub(crate) enum NativeFrameError {
    #[error("native_messaging_message_too_large")]
    MessageTooLarge,
    #[error("native messaging I/O failed: {0}")]
    Io(#[from] io::Error),
}

pub(super) fn read_message(reader: &mut impl Read) -> Result<Option<Vec<u8>>, NativeFrameError> {
    let mut header = [0_u8; 4];
    if !read_complete(reader, &mut header)? {
        return Ok(None);
    }
    let message_length = u32::from_le_bytes(header) as usize;
    if message_length > MAX_MESSAGE_BYTES {
        return Err(NativeFrameError::MessageTooLarge);
    }
    let mut message = vec![0_u8; message_length];
    if !read_complete(reader, &mut message)? {
        return Ok(None);
    }
    Ok(Some(message))
}

pub(super) fn write_message(
    writer: &mut impl Write,
    message: &[u8],
) -> Result<(), NativeFrameError> {
    if message.len() > MAX_MESSAGE_BYTES {
        return Err(NativeFrameError::MessageTooLarge);
    }
    let message_length = u32::try_from(message.len())
        .map_err(|_| NativeFrameError::MessageTooLarge)?
        .to_le_bytes();
    writer.write_all(&message_length)?;
    writer.write_all(message)?;
    writer.flush()?;
    Ok(())
}

fn read_complete(reader: &mut impl Read, buffer: &mut [u8]) -> Result<bool, NativeFrameError> {
    let mut filled = 0;
    while filled < buffer.len() {
        match reader.read(&mut buffer[filled..]) {
            Ok(0) => return Ok(false),
            Ok(read) => filled += read,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(true)
}
