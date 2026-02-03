
export interface GeoLocation {
  latitude: number;
  longitude: number;
}

export interface MatchResult {
  isMatch: boolean;
  score: number;
  distance: number; // in meters
  details: {
    gpsMatch: boolean;
    imageScore: number;
    components: {
      histogramScore: number;
      structScore?: number;
      // featureScore?: number; // Reserved for future ORB/SIFT
      // embeddingScore?: number; // Reserved for future CLIP
    };
  };
}

export interface ImageInput {
  buffer: Buffer;
  // Optional pre-parsed metadata if available
  location?: GeoLocation;
}
