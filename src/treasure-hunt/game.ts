
import { TreasureHuntMatcher } from "./matcher.js";
import { GeoLocation, MatchResult } from "./types.js";

export type GameState = "SETUP" | "HIDING" | "SEEKING" | "FOUND" | "TIMEOUT";

export class TreasureHuntGame {
  private matcher: TreasureHuntMatcher;
  private state: GameState = "SETUP";
  private matchStartTime: number | null = null; // Timestamp when continuous match started
  private gameStartTime: number | null = null;
  private timeLimitMs: number = 20 * 60 * 1000; // 20 mins for seeking
  
  // Config
  private readonly MATCH_HOLD_DURATION_MS = 5000; // 5 seconds
  private readonly MATCH_THRESHOLD = 0.70;

  constructor() {
    this.matcher = new TreasureHuntMatcher();
  }

  async startHiding() {
    this.state = "HIDING";
    // Logic for hiding timer (10 mins) could be added here
  }

  async confirmHiding(referenceImage: Buffer, location?: GeoLocation) {
    if (this.state !== "HIDING") {
      throw new Error("Not in hiding phase");
    }
    await this.matcher.setReferenceImage(referenceImage, location);
    this.state = "SEEKING";
    this.gameStartTime = Date.now();
    this.matchStartTime = null;
    console.log("Game phase switched to SEEKING");
  }

  /**
   * Process a new frame from the seeker's camera
   * @param imageBuffer The current frame
   * @param location The current GPS location
   * @returns The current match result and game status
   */
  async processFrame(imageBuffer: Buffer, location?: GeoLocation): Promise<{
    gameState: GameState;
    matchResult: MatchResult;
    progress: number; // 0 to 1, progress towards 5s hold
  }> {
    if (this.state !== "SEEKING") {
      return {
        gameState: this.state,
        matchResult: { isMatch: false, score: 0, distance: -1, details: { gpsMatch: false, imageScore: 0, components: { histogramScore: 0 } } },
        progress: 0
      };
    }

    // Check overall timeout
    if (Date.now() - (this.gameStartTime || 0) > this.timeLimitMs) {
      this.state = "TIMEOUT";
    }

    const result = await this.matcher.match(imageBuffer, location);
    // 打印 result 内容
    console.log("Match Result:", result);
    
    // Logic for 5s hold
    if (result.isMatch) {
      if (this.matchStartTime === null) {
        this.matchStartTime = Date.now();
      }
      
      const elapsed = Date.now() - this.matchStartTime;
      const progress = Math.min(elapsed / this.MATCH_HOLD_DURATION_MS, 1.0);

      if (elapsed >= this.MATCH_HOLD_DURATION_MS) {
        this.state = "FOUND";
      }

      return {
        gameState: this.state,
        matchResult: result,
        progress
      };
    } else {
      // Reset timer if match is broken
      // Optional: add some tolerance (e.g. allow 1-2 bad frames) but strict for now
      this.matchStartTime = null;
      return {
        gameState: this.state,
        matchResult: result,
        progress: 0
      };
    }
  }
}
