import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
// Support multiple environment variable names for the key
// Backend should preferably use Service Role Key for admin tasks, 
// but falls back to Anon Key if that's all that is provided.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.warn("Missing Supabase credentials in environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
