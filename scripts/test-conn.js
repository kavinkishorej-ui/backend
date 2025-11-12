// backend/scripts/test-conn.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('cwd:', process.cwd());
console.log('SUPABASE_URL:', !!url);
console.log('SUPABASE_SERVICE_ROLE_KEY present:', !!key);

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. Check backend/.env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  try {
    console.log('Sending ping (select 1 from admins) ...');
    const { data, error, status } = await supabase.from('admins').select('id, username').limit(1);
    if (error) {
      console.error('Supabase returned error:', JSON.stringify(error, null, 2));
      process.exit(1);
    }
    console.log('Success! Received:', data);
    process.exit(0);
  } catch (err) {
    console.error('Network or client error (full):', err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

run();
