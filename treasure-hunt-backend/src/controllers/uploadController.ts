import { Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import crypto from "crypto";
import { parseGpsFromBuffer, processImage } from "../utils/imageUtils.js";

const BUCKET_NAME = "treasure-hunt";

export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let fileBuffer = req.file.buffer;
    let mimeType = req.file.mimetype;
    let fileName = req.file.originalname;
    let lat = 0;
    let lng = 0;

    // Calculate MD5 hash of the ORIGINAL file buffer
    const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');

    // ... (duplicate check logic remains same) ...
    // Let's try to list files in storage with this hash prefix
    const { data: existingFiles } = await supabase.storage
        .from(BUCKET_NAME)
        .list('uploads', {
            search: fileHash
        });

    // 1. Extract GPS (Try from original buffer first)
    try {
        const gpsData = await parseGpsFromBuffer(fileBuffer);
        if (gpsData) {
            lat = gpsData.latitude;
            lng = gpsData.longitude;
            console.log(`GPS extracted: ${lat}, ${lng}`);
        } else {
            console.log("No GPS data found in original image.");
        }
    } catch (e) {
        console.warn("Failed to extract GPS:", e);
    }

    // Check duplicate AGAIN after GPS extraction to return full data
    if (existingFiles && existingFiles.length > 0) {
        const existingFile = existingFiles[0];
        const publicUrl = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(`uploads/${existingFile.name}`).data.publicUrl;
            
        console.log(`Duplicate image detected (MD5: ${fileHash}), returning existing URL.`);
        
        return res.json({
            url: publicUrl,
            lat: lat,
            lng: lng,
            message: "Image already exists, using cached version."
        });
    }

    // 2. Process Image (HEIC Convert + Compress) using shared utility
    // Only process if convert flag is true OR it's HEIC (processImage handles check)
    // Actually processImage handles everything safely.
    // If client requested convert=true, force check.
    
    // Note: processImage checks extension/mime internally. 
    // If convert=true is passed but file is jpg, processImage just compresses.
    
    try {
        const processed = await processImage(fileBuffer, fileName, mimeType);
        fileBuffer = processed.buffer;
        mimeType = processed.mimeType;
        fileName = processed.fileName;
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }

    // 4. Upload to Supabase
    // Use MD5 hash as the primary identifier in filename to enable deduplication
    const safeFileName = `${fileHash}_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '')}`;
    const filePath = `uploads/${safeFileName}`;

    // Ensure bucket exists
    const { data: bucket, error: bucketError } = await supabase.storage.getBucket(BUCKET_NAME);
    if (bucketError || !bucket) {
         const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
            public: true,
            fileSizeLimit: 10485760,
          });
          if (createError && !createError.message.includes("already exists")) {
               console.error("Failed to create bucket:", createError);
               return res.status(500).json({ error: "Failed to initialize storage" });
          }
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return res.status(500).json({ error: "Upload failed", details: uploadError.message });
    }

    // 5. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    // Return URL AND GPS data
    res.json({ 
        url: publicUrl,
        lat: lat,
        lng: lng
    });

  } catch (error: any) {
    console.error("Upload controller error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
