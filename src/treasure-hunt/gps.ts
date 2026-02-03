
import sharp from "sharp";
import exifReader from "exif-reader";
import { GeoLocation } from "./types.js";

export async function parseGpsFromBuffer(buffer: Buffer): Promise<GeoLocation | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.exif) {
      return null;
    }

    const parsed = exifReader(metadata.exif) as any;
    
    // Support both lowercase 'gps' and PascalCase 'GPSInfo' keys
    const gps = parsed.gps || parsed.GPSInfo;

    if (!gps) {
      return null;
    }

    // exif-reader returns GPS data usually as:
    // GPSLatitude: [degrees, minutes, seconds]
    // GPSLatitudeRef: 'N' or 'S'
    // GPSLongitude: [degrees, minutes, seconds]
    // GPSLongitudeRef: 'E' or 'W'

    // NOTE: exif-reader might return pre-calculated numbers if configured, 
    // but typically it returns the raw array values.
    // Let's check types. The library usually returns number[] for lat/lon.

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
    console.warn("Failed to parse GPS from buffer:", error);
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

// Haversine formula
export function calculateDistance(loc1: GeoLocation, loc2: GeoLocation): number {
  const R = 6371e3; // metres
  const φ1 = (loc1.latitude * Math.PI) / 180;
  const φ2 = (loc2.latitude * Math.PI) / 180;
  const Δφ = ((loc2.latitude - loc1.latitude) * Math.PI) / 180;
  const Δλ = ((loc2.longitude - loc1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
