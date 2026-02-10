import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ovmqcndxztfuesxtyxdv.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXFjbmR4enRmdWVzeHR5eGR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NjAzOTUsImV4cCI6MjA4NTAzNjM5NX0.oO0c-iUkM6RM_jafPzRDHWhV5PXGq7ZjpSNKD_pIsXc";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Database types
export interface UserProfile {
  id: string;
  email: string;
  tier: "FREE" | "GEN_Z" | "MILLENIAL";
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  subscription_status: string;
  created_at: string;
  updated_at: string;
}
