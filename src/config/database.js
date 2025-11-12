// backend/src/config/database.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config(); // load backend/.env

// support multiple env names
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// small helper to avoid printing full keys
const trunc = (s) => (s ? `${s.slice(0, 10)}...${s.slice(-6)}` : null);

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL in environment. Check backend/.env');
  console.error('Current working dir:', process.cwd());
  throw new Error('Missing Supabase URL');
}

const KEY_TO_USE = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
if (!KEY_TO_USE) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in environment. Check backend/.env');
  console.error('SUPABASE_URL (truncated):', trunc(SUPABASE_URL));
  throw new Error('Missing Supabase key');
}

console.log('Supabase configuration loaded:');
console.log('  SUPABASE_URL:', trunc(SUPABASE_URL));
console.log('  SUPABASE_KEY (truncated):', trunc(KEY_TO_USE));
console.log('  Using key type:', SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : (SUPABASE_ANON_KEY ? 'anon' : 'unknown')); 

// create client
const supabase = createClient(SUPABASE_URL, KEY_TO_USE, {
  auth: { persistSession: false },
  global: { headers: { 'x-my-app': 'student-marks-backend' } }
});

// Export both named and default so imports like either work
export { supabase };
export default supabase;
