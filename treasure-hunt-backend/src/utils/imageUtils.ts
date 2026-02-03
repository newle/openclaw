import sharp from "sharp";
import exifReader from "exif-reader";
import convert from "heic-convert";

export async function parseGpsFromBuffer(buffer: Buffer): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.exif) {
      return null;
    }

    const parsed = exifReader(metadata.exif) as any;
    const gps = parsed.gps || parsed.GPSInfo;

    if (!gps) {
      return null;
    }

    const lat = gps.GPSLatitude;
    const latRef = gps.GPSLatitudeRef;
    const lon = gps.GPSLongitude;
    const lonRef = gps.GPSLongitudeRef;

    if (lat && latRef && lon && lonRef) {
      const latitude = convertDMSToDD(lat[0], lat[1], lat[2], latRef);
      const longitude = convertDMSToDD(lon[0], lon[1], lon[2], lonRef);
      return { latitude, longitude };
    }

    return null;
  } catch (error) {
    // console.warn("Failed to parse GPS from buffer:", error);
    return null;
  }
}

function convertDMSToDD(degrees: number, minutes: number, seconds: number, direction: string): number {
  let dd = degrees + minutes / 60 + seconds / 3600;
  
  if (direction === "S" || direction === "W") {
    dd = dd * -1;
  }
  return dd;
}

function isHeicBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) return false;
  // Check for ftyp box at offset 4
  if (buffer.readUInt32BE(4) !== 0x66747970) return false; // "ftyp"
  
  const brand = buffer.toString('utf8', 8, 12);
  const heicBrands = ['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1'];
  return heicBrands.includes(brand) || brand.startsWith('he');
}

export async function processImage(
  buffer: Buffer, 
  originalName: string, 
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  let fileBuffer = buffer;
  let currentMime = mimeType;
  let currentName = originalName;

  // 1. HEIC Conversion (Check Magic Bytes + Name/Mime)
  const isHeic = isHeicBuffer(fileBuffer) || 
                 currentName.toLowerCase().endsWith(".heic") || 
                 currentMime === "image/heic" || 
                 currentMime === "image/heif";

  if (isHeic) {
    try {
      console.log("Converting HEIC to JPEG...");
      const outputBuffer = await convert({
        buffer: fileBuffer,
        format: 'JPEG',
        quality: 0.9
      });
      fileBuffer = Buffer.from(outputBuffer);
      currentMime = "image/jpeg";
      currentName = currentName.replace(/\.[^/.]+$/, "") + ".jpg";
    } catch (err) {
      console.error("HEIC conversion failed:", err);
      // If conversion fails, we might throw or return original
      // throwing is safer to prevent crashing later steps
      throw new Error("Server-side image conversion failed");
    }
  }

  // 2. Compress & Resize (Standardize)
  try {
    // console.log("Compressing image...");
    fileBuffer = await sharp(fileBuffer)
      .resize(1920, 1920, { 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
      
    if (currentMime !== "image/jpeg") {
      currentMime = "image/jpeg";
      currentName = currentName.replace(/\.[^/.]+$/, "") + ".jpg";
    }
  } catch (err) {
    console.error("Compression failed:", err);
    // If sharp failed, it might be because the buffer is still not supported (e.g. corrupt HEIC)
    // If we return original buffer, downstream usage (like sharp().stats()) will likely fail too.
    // It is better to throw here if we really can't process it, 
    // UNLESS the original buffer was already a valid image that sharp just choked on for some reason (rare).
    // Given the error context, it's likely format related.
    if (isHeic) {
         throw new Error("Failed to process HEIC image after conversion attempt");
    }
    // For other formats, maybe it's fine? But safer to warn.
  }

  return { buffer: fileBuffer, mimeType: currentMime, fileName: currentName };
}
