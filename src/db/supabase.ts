import { createClient } from "@supabase/supabase-js";

const url=process.env.SUPABASE_URL;
const anonKey=process.env.SUPABASE_ANON_KEY;
export const supabase=url&&anonKey?createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{"x-planwise-write-token":process.env.APP_WRITE_TOKEN??""}}}):null;
export function supabaseUnavailable(){return Response.json({error:"Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.local."},{status:503})}
