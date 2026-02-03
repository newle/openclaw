declare module 'exif-reader' {
  interface ExifData {
    image: {
      Make?: string;
      Model?: string;
      Orientation?: number;
      [key: string]: any;
    };
    thumbnail?: {
      Compression?: number;
      [key: string]: any;
    };
    exif: {
      DateTimeOriginal?: Date;
      [key: string]: any;
    };
    gps?: {
      GPSLatitude?: number[];
      GPSLatitudeRef?: string;
      GPSLongitude?: number[];
      GPSLongitudeRef?: string;
      GPSAltitude?: number;
      GPSAltitudeRef?: number;
      [key: string]: any;
    };
    interoperability?: {
      [key: string]: any;
    };
    makernote?: {
      [key: string]: any;
    };
  }

  function exifReader(buffer: Buffer): ExifData;
  export = exifReader;
}
