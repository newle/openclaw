
import sharp from "sharp";
import { parseGpsFromBuffer, calculateDistance } from "./gps.js";
import { GeoLocation, MatchResult } from "./types.js";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export class TreasureHuntMatcher {
  private referenceImage: Buffer | null = null;
  private referenceLocation: GeoLocation | null = null;
  private referenceStats: any = null;
  private referencePath: string | null = null; // Temp file path for Python script

  async setReferenceImage(imageBuffer: Buffer, location?: GeoLocation) {
    this.referenceImage = imageBuffer;
    
    // Write reference to temp file for DINOv2
    this.referencePath = path.resolve(`/tmp/ref_${Date.now()}.jpg`);
    await fs.writeFile(this.referencePath, imageBuffer);
    
    // 1. Extract GPS if not provided
    if (location) {
      this.referenceLocation = location;
    } else {
      this.referenceLocation = await parseGpsFromBuffer(imageBuffer);
    }

    // 2. Pre-compute features (Histogram)
    const image = sharp(imageBuffer);
    const stats = await image.stats();
    this.referenceStats = stats;
  }

  async match(candidateBuffer: Buffer, candidateLocation?: GeoLocation): Promise<MatchResult> {
    if (!this.referenceImage || !this.referenceStats || !this.referencePath) {
      throw new Error("Reference image not set");
    }

    // 1. GPS Check
    let currentLoc = candidateLocation;
    if (!currentLoc) {
      currentLoc = (await parseGpsFromBuffer(candidateBuffer)) || undefined;
    }

    let distance = -1;
    let gpsMatch = false;

    if (this.referenceLocation && currentLoc) {
      distance = calculateDistance(this.referenceLocation, currentLoc);
      gpsMatch = distance <= 10; // 10 meters radius
    } else {
      gpsMatch = false; // Strict
    }

    // 2. Visual Matching
    // a. Histogram Intersection (Global Color Similarity)
    const candidateImage = sharp(candidateBuffer);
    const candidateStats = await candidateImage.stats();
    
    const histogramScore = this.calculateHistogramSimilarity(this.referenceStats, candidateStats);

    // b. DINOv2 Semantic Matching (via Python)
    const candidatePath = path.resolve(`/tmp/cand_${Date.now()}.jpg`);
    await fs.writeFile(candidatePath, candidateBuffer);
    
    const dinov2Score = await this.calculateDinov2Score(this.referencePath, candidatePath);
    
    // Cleanup candidate temp file
    await fs.unlink(candidatePath).catch(() => {});

    // c. Fuse scores
    // Weighted average: 10% Histogram, 90% DINOv2
    // DINOv2 is extremely robust to lighting and angle, so we trust it more.
    const imageScore = (histogramScore * 0.1) + (dinov2Score * 0.9);

    // DINOv2 threshold is typically higher, e.g. > 0.6 is good match, > 0.7 is strong.
    // We keep overall threshold at 0.70.
    const isMatch = gpsMatch && imageScore >= 0.70;

    return {
      isMatch,
      score: imageScore,
      distance,
      details: {
        gpsMatch,
        imageScore,
        components: {
          histogramScore,
          structScore: dinov2Score, 
        }
      }
    };
  }

  private calculateHistogramSimilarity(stats1: any, stats2: any): number {
    let totalDiff = 0;
    const channels = Math.min(stats1.channels.length, stats2.channels.length);
    
    for (let i = 0; i < channels; i++) {
      const c1 = stats1.channels[i];
      const c2 = stats2.channels[i];
      const meanDiff = Math.abs(c1.mean - c2.mean) / 255;
      const stdevDiff = Math.abs(c1.stdev - c2.stdev) / 128;
      totalDiff += (meanDiff * 0.7 + stdevDiff * 0.3);
    }
    
    const avgDiff = totalDiff / channels;
    return Math.max(0, 1 - Math.pow(avgDiff, 0.5));
  }

  private async calculateDinov2Score(path1: string, path2: string): Promise<number> {
    try {
      const scriptPath = path.resolve("src/treasure-hunt/dinov2_match.py");
      const venvPython = path.resolve(".venv/bin/python3");
      
      const { stdout } = await execAsync(`${venvPython} "${scriptPath}" "${path1}" "${path2}"`);
      const result = JSON.parse(stdout);
      
      if (result.error) {
        console.error("DINOv2 Error:", result.error);
        return 0;
      }
      
      return result.score || 0;
    } catch (e) {
      console.error("Failed to run DINOv2 script:", e);
      return 0;
    }
  }
}
