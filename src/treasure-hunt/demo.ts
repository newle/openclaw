
import { TreasureHuntGame } from "./game.js";
import sharp from "sharp";
import { GeoLocation } from "./types.js";
import { parseGpsFromBuffer } from "./gps.js";

async function createTestImage(color: string): Promise<Buffer> {
  return await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: color
    }
  })
  .jpeg()
  .toBuffer();
}

async function runDemo() {
  console.log("--- Starting Treasure Hunt Game Demo ---");
  const game = new TreasureHuntGame();

  // 1. Setup Images
  // 设置 refImage 为 /Users/bytedance/Downloads/Weixin Image_20260202171327_494_16.jpg 这个文件
  // 设置 simImage 为 /Users/bytedance/Downloads/Weixin Image_20260202171334_495_16.jpg 这个文件
  // NOTE: using .withMetadata() to preserve EXIF if present
  // sharp HEIC support requires libvips built with heif support which might be missing.
  // convert using sips if on macos or skip
  // Let's assume user provides jpegs or we convert them first.
  // For this demo, let's use the helper from image-ops.ts if available, or just catch error.
  
  const loadHeicOrJpeg = async (p: string) => {
    try {
      return await sharp(p).withMetadata().toBuffer();
    } catch (e: any) {
      if (e.message && e.message.includes("heif")) {
         // Fallback: try to convert via sips (macOS)
         const { exec } = await import("child_process");
         const { promisify } = await import("util");
         const execAsync = promisify(exec);
         const tmpPath = p + ".jpg";
         await execAsync(`sips -s format jpeg "${p}" --out "${tmpPath}"`);
         const buf = await sharp(tmpPath).withMetadata().toBuffer();
         // clean up
         await execAsync(`rm "${tmpPath}"`);
         return buf;
      }
      throw e;
    }
  }

  const refImage = await loadHeicOrJpeg("/Users/bytedance/Downloads/IMG_4336.HEIC"); // Red
  const simImage = await loadHeicOrJpeg("/Users/bytedance/Downloads/IMG_4335.HEIC"); // Slightly different Red
//  const simImage = await loadHeicOrJpeg("/Users/bytedance/Downloads/IMG_4376.HEIC");
//  const diffImage = await loadHeicOrJpeg("/Users/bytedance/Downloads/IMG_4366.HEIC");
  const diffImage = await loadHeicOrJpeg("/Users/bytedance/Downloads/IMG_4376.HEIC");


  // show the 3 image
  await sharp(refImage).toFile("refImage.jpg");
  await sharp(simImage).toFile("simImage.jpg");
  await sharp(diffImage).toFile("diffImage.jpg");

// 图像位置由图片自带的 EXIF 信息获取
  // Note: These files are known to have stripped EXIF. We fallback to dummy coords for demo purposes if parsing fails.
  const extractedRefLoc = await parseGpsFromBuffer(refImage);
  const extractedSimLoc = await parseGpsFromBuffer(simImage);
  const extractedDiffLoc = await parseGpsFromBuffer(diffImage);
  
  console.log("Extracted Ref GPS:", extractedRefLoc);
  console.log("Extracted Sim GPS:", extractedSimLoc);
  console.log("Extracted Diff GPS:", extractedDiffLoc);

  const refLoc: GeoLocation = extractedRefLoc || { latitude: 40.7128, longitude: -74.0060 }; // Fallback to NYC
  const closeLoc: GeoLocation = extractedSimLoc || { latitude: 40.7128, longitude: -74.0060 };
  const farLoc: GeoLocation = extractedDiffLoc || { latitude: 41.7128, longitude: -74.0060 };

  // 5 meters away
  // 1 deg lat ~ 111km. 5m is tiny.
  // 0.00001 deg is ~1.1m.

  // 2. Start Game
  await game.startHiding();
  console.log("Hiding started...");
  
  await game.confirmHiding(refImage, refLoc);
  console.log("Hiding confirmed at NYC.");

  // 3. Test Cases
  
  // Case 1: Wrong Location, Correct Image
  console.log("\n[Case 1] Correct Image, Wrong Location");
  let result = await game.processFrame(refImage, farLoc);
  console.log(`Match: ${result.matchResult.isMatch}, GPS Match: ${result.matchResult.details.gpsMatch}, Dist: ${Math.round(result.matchResult.distance)}m`);

  // Case 2: Correct Location, Wrong Image
  console.log("\n[Case 2] Correct Location, Wrong Image (Blue vs Red)");
  result = await game.processFrame(diffImage, refLoc);
  console.log(`Match: ${result.matchResult.isMatch}, Image Score: ${result.matchResult.score.toFixed(2)}`);

  // Case 3: Correct Location, Similar Image (Simulated Match)
  console.log("\n[Case 3] Correct Location, Similar Image");
  result = await game.processFrame(simImage, closeLoc);
  console.log(`Match: ${result.matchResult.isMatch}, Score: ${result.matchResult.score.toFixed(2)}, Dist: ${Math.round(result.matchResult.distance)}m`);

  if (!result.matchResult.isMatch) {
    console.log("FAILED: Expected match for similar image.");
    return;
  }

  // 4. Test 5s Hold
  console.log("\n[Case 4] Testing 5s Hold...");
  const framesPerSec = 2; // Simulate 2 FPS
  const totalFrames = 12; // 6 seconds

  for (let i = 1; i <= totalFrames; i++) {
    // Sleep 500ms
    await new Promise(r => setTimeout(r, 500));
    
    const frameResult = await game.processFrame(simImage, closeLoc);
    console.log(`Frame ${i}: Progress ${(frameResult.progress * 100).toFixed(0)}%, State: ${frameResult.gameState}`);
    
    if (frameResult.gameState === "FOUND") {
      console.log("🎉 TREASURE FOUND!");
      break;
    }
  }
}

runDemo().catch(console.error);
