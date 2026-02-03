
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import wkx from "wkx";

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");
console.log("Loading env from:", envPath);
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  console.log("URL:", supabaseUrl ? "Set" : "Missing");
  console.log("Key:", supabaseKey ? "Set" : "Missing");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .limit(1);

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Data:", data);
    if (data && data.length > 0) {
        console.log("Coordinates type:", typeof data[0].coordinates);
        console.log("Coordinates value:", data[0].coordinates);

        const hex = data[0].coordinates;
        try {
            const buffer = Buffer.from(hex, 'hex');
            const geometry = wkx.Geometry.parse(buffer);
            console.log("Parsed Geometry:", geometry.toGeoJSON());
        } catch(e) {
            console.error("Parsing failed:", e);
        }
    }
  }
}

test();
