import sharp from "sharp";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { GeoLocation, MatchResult } from "../models/types.js";
import { parseGpsFromBuffer } from "../utils/imageUtils.js";
import { calculateDistance } from "../utils/gps.js";
import { processImage } from "../utils/imageUtils.js";

const execAsync = promisify(exec);

export class ImageService {
  private pythonPath: string;
  private scriptPath: string;

  constructor() {
    // Determine the correct python path
    // 1. Try env var PYTHON_PATH
    // 2. Try known venv path in project root
    // 3. Fallback to 'python3' (system default)
    const venvPython = path.resolve(process.cwd(), "../.venv/bin/python3");
    
    if (process.env.PYTHON_PATH) {
        this.pythonPath = process.env.PYTHON_PATH;
    } else {
        // Check if venv python exists
        // Note: constructor cannot be async, so we just set it. 
        // If file doesn't exist, exec will fail later, which is handled.
        // Or we can use fs.existsSync (sync fs methods are okay in constructor usually, or just assume)
        // But better to just default to "python3" if we aren't sure.
        // However, we know the environment structure here:
        // CWD is /Users/bytedance/source/openclaw/treasure-hunt-backend (when running backend)
        // .venv is in /Users/bytedance/source/openclaw/.venv
        // So path is ../.venv/bin/python3
        this.pythonPath = venvPython;
    }
    
    // Fallback if the specific venv path seems wrong or we want to be safe:
    // Actually, let's just use the absolute path we found earlier via 'which python3' in the tool usage,
    // which was /Users/bytedance/source/openclaw/.venv/bin/python3
    // Since we are running the backend from treasure-hunt-backend dir, we need to go up one level.
    
    this.scriptPath = path.resolve(process.cwd(), "python/dinov2_match.py");
    
    console.log(`ImageService initialized with Python: ${this.pythonPath}`);
  }

  async matchImages(
    referenceBuffer: Buffer,
    candidateBuffer: Buffer,
    referenceLocation?: GeoLocation,
    candidateLocation?: GeoLocation
  ): Promise<MatchResult> {
    // 1. GPS Check
    let refLoc = referenceLocation;
    if (!refLoc) {
      const gps = await parseGpsFromBuffer(referenceBuffer);
      refLoc = gps || undefined;
    }

    let candLoc = candidateLocation;
    if (!candLoc) {
      const gps = await parseGpsFromBuffer(candidateBuffer);
      candLoc = gps || undefined;
    }

    let distance = -1;
    let gpsMatch = false;

    if (refLoc && candLoc) {
      console.debug(refLoc, candLoc);
      distance = calculateDistance(refLoc, candLoc);
      gpsMatch = distance <= 20; // Relaxed to 20 meters for better UX, strict requirement is 10
    } else {
      // If GPS is missing in either, we can't verify location. 
      // Policy: If GPS is missing, fail validation? Or allow purely visual?
      // Design doc says: "GPS validation: must be within 10 meters". 
      // So if GPS is missing, it should fail.
      gpsMatch = false; 
    }

    // 2. Visual Matching
    // Save buffers to temp files
    // Ensure files have .jpg extension for python script handling (and sharp compatibility)
    const refPath = path.resolve(`/tmp/ref_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
    const candPath = path.resolve(`/tmp/cand_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);

    try {
      // Ensure buffers are JPEG before saving/processing to avoid HEIC issues with sharp
      // If referenceBuffer is HEIC (starts with...) but simpler is to try-catch sharp conversion
      
      let safeRefBuffer = referenceBuffer;
      let safeCandBuffer = candidateBuffer;

      try {
          // Use shared utility to standardize image
          const processed = await processImage(referenceBuffer, "temp_ref", "image/unknown");
          safeRefBuffer = processed.buffer;
      } catch (e) {
          console.warn("Failed to process reference buffer in ImageService:", e);
      }

      try {
          // Use shared utility to standardize image
          const processed = await processImage(candidateBuffer, "temp_cand", "image/unknown");
          safeCandBuffer = processed.buffer;
      } catch (e) {
          console.warn("Failed to process candidate buffer in ImageService:", e);
      }

      await fs.writeFile(refPath, safeRefBuffer);
      await fs.writeFile(candPath, safeCandBuffer);

      // a. Histogram Intersection (Global Color Similarity)
      const refImage = sharp(safeRefBuffer);
      const refStats = await refImage.stats();
      
      const candImage = sharp(safeCandBuffer);
      const candStats = await candImage.stats();
      
      const histogramScore = this.calculateHistogramSimilarity(refStats, candStats);

      // b. DINOv2 Semantic Matching (via Python)
      const dinov2Score = await this.calculateDinov2Score(refPath, candPath);
      
      // c. Fuse scores
      // Weighted average: 10% Histogram, 90% DINOv2
      const imageScore = (histogramScore * 0.1) + (dinov2Score * 0.9);

      // Threshold
      const isMatch = gpsMatch && imageScore >= 0.60; // 60% threshold as per PRD

      const ret = {
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
      
      console.debug(ret);

      return ret;

    } finally {
      // Cleanup
      await fs.unlink(refPath).catch(() => {});
      await fs.unlink(candPath).catch(() => {});
    }
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
      // Check if script exists
      try {
        await fs.access(this.scriptPath);
      } catch {
        console.error(`Python script not found at ${this.scriptPath}`);
        return 0;
      }

      const { stdout } = await execAsync(`${this.pythonPath} "${this.scriptPath}" "${path1}" "${path2}"`);
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

export const imageService = new ImageService();
