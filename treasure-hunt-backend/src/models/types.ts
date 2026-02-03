export interface GeoLocation {
  latitude: number;
  longitude: number;
}

export interface MatchResult {
  isMatch: boolean;
  score: number;
  distance: number;
  details: {
    gpsMatch: boolean;
    imageScore: number;
    components: {
      histogramScore: number;
      structScore: number;
    };
  };
}
