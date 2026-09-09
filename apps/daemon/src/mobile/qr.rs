use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use png::{BitDepth, ColorType, Encoder};
use qrcode::QrCode;
use qrcode::types::{Color, EcLevel, QrError};
use thiserror::Error;

const IMAGE_SIZE: usize = 256;
const QUIET_ZONE_MODULES: usize = 2;

#[derive(Debug, Error)]
pub(super) enum QrDataUrlError {
    #[error("QR encoding failed: {0}")]
    Qr(#[from] QrError),
    #[error("QR PNG encoding failed: {0}")]
    Png(#[from] png::EncodingError),
    #[error("pairing offer is too large for a 256px QR code")]
    TooLarge,
}

pub(super) fn create_png_data_url(value: &str) -> Result<String, QrDataUrlError> {
    let code = QrCode::with_error_correction_level(value.as_bytes(), EcLevel::M)?;
    let module_count = code.width();
    let full_module_count = module_count + QUIET_ZONE_MODULES * 2;
    let scale = IMAGE_SIZE / full_module_count;
    if scale == 0 {
        return Err(QrDataUrlError::TooLarge);
    }
    let rendered_size = full_module_count * scale;
    let code_offset = (IMAGE_SIZE - rendered_size) / 2 + QUIET_ZONE_MODULES * scale;
    let mut pixels = vec![u8::MAX; IMAGE_SIZE * IMAGE_SIZE];
    for y in 0..module_count {
        for x in 0..module_count {
            if code[(x, y)] != Color::Dark {
                continue;
            }
            let pixel_x = code_offset + x * scale;
            let pixel_y = code_offset + y * scale;
            for row in pixel_y..pixel_y + scale {
                pixels[row * IMAGE_SIZE + pixel_x..row * IMAGE_SIZE + pixel_x + scale].fill(0);
            }
        }
    }
    let mut png = Vec::new();
    {
        let mut encoder = Encoder::new(&mut png, IMAGE_SIZE as u32, IMAGE_SIZE as u32);
        encoder.set_color(ColorType::Grayscale);
        encoder.set_depth(BitDepth::Eight);
        let mut writer = encoder.write_header()?;
        writer.write_image_data(&pixels)?;
    }
    Ok(format!("data:image/png;base64,{}", BASE64.encode(png)))
}
