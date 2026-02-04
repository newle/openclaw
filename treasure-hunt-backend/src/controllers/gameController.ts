import { Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import { imageService } from "../services/imageService.js";
import { parseGpsFromBuffer, processImage } from "../utils/imageUtils.js";
import { GeoLocation } from "../models/types.js";
import sharp from "sharp";
import exifReader from "exif-reader";
import wkx from "wkx";
import crypto from "crypto";

// Helper function to convert DMS to Decimal Degrees
function convertDMSToDD(degrees: number, minutes: number, seconds: number, direction: string): number {
  let dd = degrees + minutes / 60 + seconds / 3600;
  
  if (direction === "S" || direction === "W") {
    dd = dd * -1;
  }
  return dd;
}

// Helper function to parse coordinates from PostGIS (GeoJSON or WKB/WKT)
function parseCoordinates(input: any): { lat: number, lng: number } | null {
    if (!input) return null;

    let lat = 0, lng = 0;

    // If it's a GeoJSON object (PostGIS/Supabase default)
    if (typeof input === 'object' && Array.isArray(input.coordinates)) {
         [lng, lat] = input.coordinates;
         return { lat, lng };
    } 
    
    // If it's a string (WKB hex or WKT)
    if (typeof input === 'string') {
        // Check if it's a hex string (WKB)
        if (/^[0-9a-fA-F]+$/.test(input)) {
            try {
                const buffer = Buffer.from(input, 'hex');
                const geometry = wkx.Geometry.parse(buffer);
                const geoJson = geometry.toGeoJSON() as { coordinates: number[] };
                if (Array.isArray(geoJson.coordinates)) {
                    [lng, lat] = geoJson.coordinates;
                    return { lat, lng };
                }
            } catch (e) {
                console.error("Failed to parse WKB:", e);
            }
        } else {
            // Try WKT regex
            const matches = input.match(/\(([^)]+)\)/);
            if (matches) {
                const parts = matches[1].split(' ');
                lng = parseFloat(parts[0]);
                lat = parseFloat(parts[1]);
                return { lat, lng };
            }
        }
    }
    return null;
}

// Helper to generate a random 4-digit code
function generateJoinCode(): string {
  // 生成0-9999之间的随机整数
  const num = Math.floor(Math.random() * 10000);
  // 转换为字符串并确保是4位数，不足的前面补0
  return num.toString().padStart(4, '0');
}

export const joinByCode = async (req: Request, res: Response) => {
    try {
        const { code } = req.body;
        
        if (!code || code.length !== 4) {
            return res.status(400).json({ error: "Invalid code format" });
        }

        // Find treasure with this code
        // Must be valid and not expired
        const now = new Date().toISOString();
        
        const { data: treasure, error } = await supabase
            .from("treasures")
            .select("id")
            .eq("join_code", code)
            .gt("join_code_expires_at", now)
            .single();

        if (error || !treasure) {
             return res.status(404).json({ error: "Code invalid or expired" });
        }

        res.json({ treasureId: treasure.id });

    } catch (error: any) {
        console.error("Join Code Error:", error);
        res.status(500).json({ error: "Failed to join via code", details: error.message });
    }
};

export const regenerateCode = async (req: Request, res: Response) => {
    try {
        const { treasureId, userId } = req.body;
        
        if (!treasureId || !userId) {
             return res.status(400).json({ error: "Missing treasureId or userId" });
        }

        // Verify ownership
        const { data: treasure } = await supabase
            .from("treasures")
            .select("creator_id")
            .eq("id", treasureId)
            .single();
            
        if (!treasure || treasure.creator_id !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Generate new code
        const newCode = generateJoinCode();
        // Expires in 5 minutes
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        const { error: updateError } = await supabase
            .from("treasures")
            .update({
                join_code: newCode,
                join_code_expires_at: expiresAt
            })
            .eq("id", treasureId);

        if (updateError) throw updateError;

        res.json({ joinCode: newCode, expiresAt });

    } catch (error: any) {
        console.error("Regenerate Code Error:", error);
        res.status(500).json({ error: "Failed to regenerate code", details: error.message });
    }
};

export const getTreasures = async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const filter = req.query.filter as string; // 'public', 'created', 'participated'
    
    // Validate UUID format to prevent query errors
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

    if (!isValidUUID && (filter === 'created' || filter === 'participated')) {
        return res.json([]); // Can't fetch user specific lists without valid user
    }

    let query = supabase
      .from("treasures")
      .select(`
        *,
        creator:users(nickname, avatar_url),
        locations:locations(id)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    console.debug("Querying treasures with userId:", userId);
    
    if (filter === 'participated' && isValidUUID) {
        // 1. Get participated treasure IDs first
        const { data: participations } = await supabase
            .from("participations")
            .select("treasure_id")
            .eq("user_id", userId);
            
        const treasureIds = participations?.map(p => p.treasure_id) || [];
        
        if (treasureIds.length === 0) {
            return res.json([]);
        }
        
        query = query.in('id', treasureIds);
        
    } else if (filter === 'created' && isValidUUID) {
        query = query.eq('creator_id', userId);
        
    } else if (filter === 'public') {
        query = query.eq('is_public', true);
        
    } else {
        // Default behavior (fallback or 'all')
        if (isValidUUID) {
           // Show public treasures OR private treasures created by this user
           query = query.or(`is_public.eq.true,creator_id.eq.${userId}`);
        } else {
           // Only show public treasures
           query = query.eq('is_public', true);
        }
    }

    const { data: treasures, error } = await query;
//    console.debug("Raw query result:", treasures);

    if (error) throw error;

    const resultPromises = treasures.map(async (t: any) => {
        // 2. Get Progress
        if (isValidUUID) {
            const { data: participation } = await supabase
                .from("participations")
                .select("final_cost, is_completed")
                .eq("user_id", userId)
                .eq("treasure_id", t.id)
                .single();
            
            return {
                ...t,
                locations: { count: t.locations?.length || 0 },
                participation: participation || null
            };
        }

        return {
            ...t,
            locations: { count: t.locations?.length || 0 }
        };
    });

    const result = await Promise.all(resultPromises);

    res.json(result);
  } catch (error: any) {
    console.error("Get Treasures Error:", error);
    res.status(500).json({ error: "Failed to fetch treasures", details: error.message });
  }
};

export const getTreasureDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data: treasure, error } = await supabase
      .from("treasures")
      .select(`
        *,
        creator:users(nickname, avatar_url),
        locations(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!treasure) return res.status(404).json({ error: "Treasure not found" });

    // Transform locations to include parsed coordinates
    if (treasure.locations && Array.isArray(treasure.locations)) {
        treasure.locations = treasure.locations.map((loc: any) => {
            const coords = parseCoordinates(loc.coordinates);
            return {
                ...loc,
                lat: coords?.lat,
                lng: coords?.lng,
                // Keep original coordinates or remove them? 
                // Let's keep them but also provide lat/lng which frontend likely needs
            };
        });
    }

    res.json(treasure);
  } catch (error: any) {
    console.error("Get Treasure Detail Error:", error);
    res.status(500).json({ error: "Failed to fetch treasure details", details: error.message });
  }
};

export const getTreasureProgress = async (req: Request, res: Response) => {
  try {
    const { id: treasureId } = req.params;
    const { userId } = req.query; // Pass userId as query param for now

    if (!treasureId || !userId) {
        return res.status(400).json({ error: "Missing treasureId or userId" });
    }

    // 1. Find participation
    let { data: participation } = await supabase
        .from("participations")
        .select("id, is_completed, final_cost")
        .eq("user_id", userId)
        .eq("treasure_id", treasureId)
        .single();
    
    if (!participation) {
        // No participation yet means not started.
        return res.json({ verifiedLocationIds: [], verifications: [], hasParticipation: false });
    }

    // 2. Get verifications
    // NOTE: supabase.from().select() returns an array if multiple rows match, or null if no rows and using .single()
    // Here we expect multiple rows (array).
    const { data: verifications } = await supabase
        .from("verifications")
        .select("*")
        .eq("participation_id", participation.id)
        .eq("is_verified", true);

    const verifiedLocationIds = verifications?.map(v => v.location_id) || [];
    
    // Calculate Rank
    // Only calculate if completed
    let rank = 0;
    if (participation.is_completed && participation.final_cost !== null) {
        // Count how many completed participations have a lower (better) final_cost for this treasure
        // OR same cost but earlier end_time (tie-breaker) - omitting tie-breaker for simplicity
        const { count, error } = await supabase
            .from("participations")
            .select("id", { count: 'exact', head: true })
            .eq("treasure_id", treasureId)
            .eq("is_completed", true)
            .lt("final_cost", participation.final_cost);
        
        if (!error) {
            rank = (count || 0) + 1;
        }
    }

    res.json({ 
        verifiedLocationIds,
        verifications: verifications || [],
        hasParticipation: true,
        is_completed: participation.is_completed,
        final_cost: participation.final_cost,
        rank: rank > 0 ? rank : null // Return rank if applicable
    });

  } catch (error: any) {
    console.error("Get Progress Error:", error);
    res.status(500).json({ error: "Failed to fetch progress", details: error.message });
  }
};

export const startGame = async (req: Request, res: Response) => {
    try {
        const { treasureId, userId, nickname } = req.body; // Accept nickname from frontend
        
        if (!treasureId || !userId) {
            return res.status(400).json({ error: "Missing treasureId or userId" });
        }

        // Ensure user exists
        const { data: userExists } = await supabase.from('users').select('id').eq('id', userId).single();
        if (!userExists) {
             await supabase.from('users').insert({
                id: userId,
                openid: `temp_${userId}`, 
                nickname: nickname || 'Explorer', // Use provided nickname
            });
        } else if (nickname && nickname !== 'Explorer') {
            // Update nickname if provided and better than default
             await supabase.from('users').update({ nickname }).eq('id', userId);
        }

        // Check if already started
        const { data: existing } = await supabase
            .from("participations")
            .select("id")
            .eq("user_id", userId)
            .eq("treasure_id", treasureId)
            .single();
        
        if (existing) {
            return res.json({ message: "Already started", participationId: existing.id });
        }

        // Create participation
        const { data: newPart, error } = await supabase
            .from("participations")
            .insert({
                user_id: userId,
                treasure_id: treasureId,
                start_time: new Date().toISOString(),
                // status: 'in_progress' // Optional if column missing
            })
            .select("id")
            .single();

        if (error) throw error;

        res.json({ message: "Game started", participationId: newPart.id });

    } catch (error: any) {
        console.error("Start Game Error:", error);
        res.status(500).json({ error: "Failed to start game", details: error.message });
    }
};

export const createTreasure = async (req: Request, res: Response) => {
  try {
    const { title, description, difficulty, locations, isPublic } = req.body;
    // Assuming we have middleware to extract userId from token
    const userId = req.body.userId; // Temporary: expect client to send userId for now or use middleware

    if (!title || !locations || locations.length === 0) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1. Create Treasure
    // NOTE: creator_id references 'users' table. 
    // In our simplified setup, if we haven't synced auth.users to public.users, this might fail if we pass raw UUID from token.
    // We need to ensure the user exists in public.users table.
    
    // Check if user exists, if not create/sync it (Simple approach for prototype)
    const { data: userExists } = await supabase.from('users').select('id').eq('id', userId).single();
    
    if (!userExists) {
        // Create user record if missing (In real app, trigger handles this on signup)
        // We'll use a dummy openid/nickname for now since we don't have full profile info here
        await supabase.from('users').insert({
            id: userId,
            openid: `temp_${userId}`, // Dummy openid to satisfy unique constraint
            nickname: 'Explorer',
        });
    }

    // Generate Join Code if private
    let joinCode = null;
    let expiresAt = null;
    
    if (isPublic === false) {
        joinCode = generateJoinCode();
        expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 mins
    }

    const { data: treasure, error: treasureError } = await supabase
      .from("treasures")
      .insert({
        creator_id: userId,
        title,
        description,
        difficulty,
        is_public: isPublic !== undefined ? isPublic : false, // Default to false (private) if not specified
        join_code: joinCode,
        join_code_expires_at: expiresAt,
        // Use the first location as the center location for now
        center_location: `POINT(${locations[0].lng} ${locations[0].lat})`
      })
      .select()
      .single();

    if (treasureError) throw treasureError;

    // 2. Create Locations
    const locationsToInsert = locations.map((loc: any, index: number) => ({
      treasure_id: treasure.id,
      order_index: index,
      coordinates: `POINT(${loc.lng} ${loc.lat})`,
      photo_url: loc.photoUrl,
      description: loc.description,
      // hint: loc.hint // Schema doesn't have hint yet? Let's check schema.
      // Schema has 'description', 'photo_features'. 
      // Wait, schema check:
      // CREATE TABLE locations ( ... description TEXT ... )
      // If we want 'hint', we might need to add it or overload description.
      // For now let's append hint to description or ignore if no column.
    }));

    const { error: locationsError } = await supabase
      .from("locations")
      .insert(locationsToInsert);

    if (locationsError) throw locationsError;

    res.status(201).json({ 
        message: "Treasure created successfully", 
        treasureId: treasure.id,
        joinCode: joinCode,
        expiresAt: expiresAt
    });

  } catch (error: any) {
    console.error("Create Treasure Error:", error);
    res.status(500).json({ error: "Failed to create treasure", details: error.message });
  }
};

export const getTreasureLeaderboard = async (req: Request, res: Response) => {
  try {
    const { id: treasureId } = req.params;
    const { userId } = req.query;

    if (!treasureId) {
        return res.status(400).json({ error: "Missing treasureId" });
    }

    // 1. Fetch all completed participations for this treasure
    // Ordered by cost (ASC) and time (ASC)
    // NOTE: 'users' table might NOT have 'username' column if it's not synced from auth.users or schema differs.
    // Let's check schema. If error says "column users_1.username does not exist", then it's not there.
    // We should fallback to nickname only.
    
    const { data: allCompleted, error } = await supabase
        .from("participations")
        .select(`
            id,
            user_id,
            final_cost,
            end_time,
            user:users(nickname, avatar_url)
        `)
        .eq("treasure_id", treasureId)
        .eq("is_completed", true)
        .order("final_cost", { ascending: true })
        .order("end_time", { ascending: true })
        .limit(100); // Limit to top 100 for performance, usually enough for context

    if (error) throw error;
    if (!allCompleted) return res.json([]);

    // Add rank to each item
    const rankedList = allCompleted.map((item: any, index: number) => ({
        rank: index + 1,
        user_id: item.user_id,
        // Fallback: use nickname. If user registered via our simple flow, nickname IS the name they gave (or default Explorer)
        // If we want real username (email/login), we need to query auth.users which is not directly accessible via public API usually,
        // or we rely on what we stored in public.users table.
        nickname: item.user?.nickname || 'Unknown Explorer',
        avatar_url: item.user?.avatar_url,
        final_cost: item.final_cost,
        is_me: item.user_id === userId
    }));

    // 2. Construct response
    // Requirement: Top 5 + (Gap) + User-1, User, User+1
    
    const top5 = rankedList.slice(0, 5);
    let result = [...top5];
    
    if (userId) {
        const userRankIndex = rankedList.findIndex(r => r.user_id === userId);
        
        if (userRankIndex !== -1) {
            // User is in the list
            const userRank = userRankIndex + 1;
            
            // If user is already in top 5, we don't need to do anything special
            if (userRank > 5) {
                // Determine neighbors range
                // We want: [userRank-1, userRank, userRank+1]
                // Indices: [userRankIndex-1, userRankIndex, userRankIndex+1]
                
                const start = Math.max(5, userRankIndex - 1); // Don't overlap with top 5
                const end = Math.min(rankedList.length, userRankIndex + 2); // Slice end is exclusive
                
                const neighbors = rankedList.slice(start, end);
                
                if (neighbors.length > 0) {
                     // If there is a gap between top5 and neighbors, frontend handles visual separator
                     // But we can return them in a single list? 
                     // Or better, return a structured object so frontend knows about the gap.
                     // The requirement says "ellipsis", so frontend needs to know if there's a jump.
                     // Let's just return the relevant rows.
                     
                     // Ensure we don't duplicate if overlap (handled by start index logic)
                     result = [...result, ...neighbors];
                }
            }
        }
    }
    
    // Deduplicate just in case
    const uniqueResult = Array.from(new Map(result.map(item => [item.user_id, item])).values())
        .sort((a, b) => a.rank - b.rank);

    res.json(uniqueResult);

  } catch (error: any) {
    console.error("Get Leaderboard Error:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard", details: error.message });
  }
};

export const verifyLocation = async (req: Request, res: Response) => {
  try {
    const { treasureId, locationId, photo, userLocation } = req.body;
    const userId = req.body.userId; // Middleware should populate this from token

    if (!treasureId || !locationId || !photo) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1. Get target location data from DB
    const { data: locationData, error: locError } = await supabase
      .from("locations")
      .select("*")
      .eq("id", locationId)
      .single();

    if (locError || !locationData) {
      return res.status(404).json({ error: "Location not found" });
    }

    // 2. Prepare data for matching
    // Convert base64 photo to buffer
    const candidateBuffer = Buffer.from(photo.replace(/^data:image\/\w+;base64,/, ""), "base64");
    // Extract GPS from candidate photo via imageUtil
    let userLat = 0;
    let userLng = 0;

    // Priority: 1. EXIF data, 2. Browser Geolocation (most reliable for mobile web)
    try {
        const gpsData = await parseGpsFromBuffer(candidateBuffer);
        if (gpsData && gpsData.latitude && gpsData.longitude) {
            userLat = gpsData.latitude;
            userLng = gpsData.longitude;
            console.debug(`Extracted GPS from photo: ${userLng}, ${userLat}`);
        }
    } catch (exifErr) {
        console.warn("Failed to extract GPS from photo:", exifErr);
    }
    // If EXIF failed or no GPS, fallback to userLocation from request body
    if (!userLat || !userLng) {
        if (userLocation && userLocation.latitude && userLocation.longitude) {
            userLat = userLocation.latitude;
            userLng = userLocation.longitude;
            console.debug(`Fallback to userLocation GPS: ${userLng}, ${userLat}`);
        } else {
            // return res.status(400).json({ error: "No valid location data found" });
            console.warn("No valid location data found in request, proceeding with visual-only match.");
            // Proceed with null/undefined location, imageService will handle strict mode
        }
    }



    // Compress candidate photo immediately for faster matching and later upload
    let processedCandidateBuffer: Buffer = candidateBuffer;
    try {
        const processed = await processImage(candidateBuffer, "verification.jpg", "image/jpeg");
        processedCandidateBuffer = processed.buffer;
    } catch (processErr) {
        console.warn("Failed to compress verification image, using original:", processErr);
    }

    // Get reference photo buffer
    let referenceBuffer: Buffer;
    try {
        const response = await fetch(locationData.photo_url);
        const arrayBuffer = await response.arrayBuffer();
        referenceBuffer = Buffer.from(arrayBuffer);
    } catch (e) {
        console.error("Failed to fetch reference image:", e);
        return res.status(500).json({ error: "Failed to load reference image" });
    }

    const candidateLocation: GeoLocation = { latitude: userLat, longitude: userLng };
    // Reference location from DB (PostGIS point to lat/lng)
    // locationData.coordinates is likely GeoJSON or similar depending on Supabase client return
    // If it's a PostGIS column, Supabase might return it as a string or object.
    // We assume standard GeoJSON Point: { type: 'Point', coordinates: [lng, lat] }
    // OR just lat/lng if we stored it that way. 
    // The migration used GEOGRAPHY(POINT, 4326). Supabase-js returns GeoJSON.
    
    // Parsing GeoJSON
    let refLat = 0, refLng = 0;
    console.debug(locationData);
    
    const parsedCoords = parseCoordinates(locationData.coordinates);
    if (parsedCoords) {
        refLat = parsedCoords.lat;
        refLng = parsedCoords.lng;
        console.debug(`Parsed Reference GPS: ${refLng}, ${refLat}`);
    }

    const referenceLocation: GeoLocation = { latitude: refLat, longitude: refLng };

    // 3. Perform Match
    // Ensure we are not passing HEIC to sharp inside matchImages without conversion?
    // imageService usually uses sharp. 
    // The error "source: bad seek to 2802146" or "heif: Error while loading plugin" usually means
    // either sharp is trying to read a HEIC/HEIF file but the underlying libheif is missing or corrupt,
    // OR the buffer is corrupt/incomplete.
    // Since 'candidateBuffer' comes from base64 (likely JPEG from browser canvas/capture), it should be fine.
    // 'referenceBuffer' comes from storage URL. If that URL points to a HEIC file, sharp might fail if not configured.
    // BUT we converted uploads to JPEG in uploadController. So stored files SHOULD be JPEG.
    // UNLESS: Some old files or direct uploads are HEIC.
    
    // Let's add a safety check/conversion for reference buffer if needed, but primarily check imageService.
    
    // Wait, the error mentions "heif". This implies one of the inputs IS detected as HEIC.
    // If we are running on a system where sharp wasn't installed with HEIC support, it will fail.
    // Check if referenceBuffer is the culprit.
    
    // Let's try to make sure both buffers are converted to standard format before matching if possible.
    // But imageService.matchImages likely calls sharp(buffer).metadata() or similar.
    
    const matchResult = await imageService.matchImages(
      referenceBuffer,
      processedCandidateBuffer, // Use processed buffer for matching
      referenceLocation,
      candidateLocation
    );

    // 4. Record Verification
    // Ensure user exists in public.users (for FK constraint)
    const { data: userExists } = await supabase.from('users').select('id, nickname').eq('id', userId).single();
    if (!userExists) {
         // Auto-create user if missing
         // Try to fetch user metadata from Auth (if we had access, but we don't easily here without admin client)
         // For now default to 'Explorer'
         await supabase.from('users').insert({
            id: userId,
            openid: `temp_${userId}`, 
            nickname: 'Explorer',
        });
    } else if (userExists.nickname === 'Explorer') {
        // OPTIONAL: If nickname is still default, try to update it?
        // Since we can't easily access auth metadata here without the user's JWT or admin client,
        // we might leave it. 
        // BUT, if the frontend sends the nickname in the request body, we could update it.
    }

    // First, find or create participation record
    let { data: participation, error: partError } = await supabase
        .from("participations")
        .select("id")
        .eq("user_id", userId)
        .eq("treasure_id", treasureId)
        .single();
    
    // Ignore error if it's just "not found"
    
    if (!participation) {
        // Create participation
        // NOTE: Now we ONLY create participation when user explicitly starts (via separate endpoint)
        // OR we can create it here if it's missing?
        // Requirement: "点击开始寻宝后，才会插入participations"
        // So verifyLocation should FAIL if participation doesn't exist?
        // Or should we assume they started?
        // If they verify, they must have started. 
        // But if they haven't clicked "Start", maybe we should error: "Please start the game first".
        
        return res.status(400).json({ error: "Game not started. Please click 'Start Hunt' first." });
    }
    
    // Define uploadedPhotoUrl in outer scope of try block
    let uploadedPhotoUrl = "";
    
    if (participation) {
        // Upload photo to storage if it's a match
        const BUCKET_NAME = "treasure-hunt"; // Use consistent bucket name
        
        if (matchResult.isMatch) {
             try {
                 // Calculate MD5 of processed buffer
                 const fileHash = crypto.createHash('md5').update(candidateBuffer).digest('hex');
                 
                 // Check if file with this hash already exists in storage
                 // We'll search by hash prefix in the bucket
                 const { data: existingFiles } = await supabase.storage
                     .from(BUCKET_NAME)
                     .list('verifications', {
                         search: fileHash
                     });
                 
                 if (existingFiles && existingFiles.length > 0) {
                      // File exists, reuse it
                      const existingFile = existingFiles[0];
                      const { data: publicUrlData } = supabase.storage
                         .from(BUCKET_NAME)
                         .getPublicUrl(`verifications/${existingFile.name}`);
                      uploadedPhotoUrl = publicUrlData.publicUrl;
                      console.log(`Duplicate verification photo detected (MD5: ${fileHash}), using existing.`);
                 } else {
                     // Upload new file
                     // Include hash in filename for future deduplication
                     const fileName = `verifications/${participation.id}/${fileHash}_${locationId}.jpg`;
                     
                     // Use already processed buffer for upload
                     const { error: uploadError } = await supabase.storage
                         .from(BUCKET_NAME)
                         .upload(fileName, processedCandidateBuffer, {
                             contentType: "image/jpeg",
                             upsert: true
                         });
                     
                     if (uploadError) {
                         console.error("Failed to upload verification photo:", uploadError);
                     } else {
                         const { data: publicUrlData } = supabase.storage
                             .from(BUCKET_NAME)
                             .getPublicUrl(fileName);
                         uploadedPhotoUrl = publicUrlData.publicUrl;
                     }
                 }
             } catch (e) {
                 console.error("Error uploading photo:", e);
             }
        }

        // Check if already verified
        const { data: existingVerification } = await supabase
            .from("verifications")
            .select("id")
            .eq("participation_id", participation.id)
            .eq("location_id", locationId)
            .eq("is_verified", true)
            .single();

        if (existingVerification) {
            // Already verified, update score if better
            if (matchResult.isMatch) {
                const updateData: any = {
                    similarity_score: matchResult.score,
                    distance_meters: matchResult.distance,
                };
                if (uploadedPhotoUrl) {
                    updateData.photo_url = uploadedPhotoUrl;
                }

                await supabase.from("verifications")
                    .update(updateData)
                    .eq("id", existingVerification.id);
            }
        } else {
            // New verification attempt
            await supabase.from("verifications").insert({
                participation_id: participation.id,
                location_id: locationId,
                photo_url: uploadedPhotoUrl || "", // Store URL if uploaded
                similarity_score: matchResult.score,
                distance_meters: matchResult.distance,
                is_verified: matchResult.isMatch
            });
        }
        
        // Check completion status
        if (matchResult.isMatch) {
            // Check if this was the last unverified location
            // Get all locations for this treasure
            const { data: allLocations } = await supabase
                .from("locations")
                .select("id")
                .eq("treasure_id", treasureId);
            
            // Get all verified locations for this participation (including just added)
            const { data: verifiedLocs } = await supabase
                .from("verifications")
                .select("location_id")
                .eq("participation_id", participation.id)
                .eq("is_verified", true);
            
            const totalLocations = allLocations?.length || 0;
            const verifiedCount = verifiedLocs?.length || 0;

            if (totalLocations > 0 && verifiedCount >= totalLocations) {
                // Completed!
                // Calculate score (duration in seconds)
                // Need start_time from participation. 
                // Schema check: start_time exists? Assuming yes based on requirement.
                const { data: currentPart } = await supabase
                    .from("participations")
                    .select("start_time")
                    .eq("id", participation.id)
                    .single();
                
                const startTime = currentPart?.start_time ? new Date(currentPart.start_time) : new Date(); // Fallback if missing
                const endTime = new Date();
                const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
                
                // Update participation
                await supabase.from("participations")
                    .update({
                        is_completed: true,
                        end_time: endTime.toISOString(),
                        final_cost: durationSeconds // Storing duration as cost (seconds)
                    })
                    .eq("id", participation.id);
            }
        }
    }

    res.json({
      verified: matchResult.isMatch,
      similarity: matchResult.score * 100,
      distance: matchResult.distance,
      photo_url: uploadedPhotoUrl || "" // Return uploaded URL to frontend
    });

  } catch (error: any) {
    console.error("Verify Error:", error);
    res.status(500).json({ error: "Verification failed", details: error.message });
  }
};
