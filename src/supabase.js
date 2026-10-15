import { createClient } from '@supabase/supabase-js';
// Public (publishable) values — protected by RLS. Shared Baytuna project, Bayt Health uses bh_* tables only.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://usvzitrtohylmszbcqnk.supabase.co';
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_COAaKWMxgKtIQjYNR-_fsw_KEpZq3SK';
export const supabase = createClient(url, key, { auth: { persistSession: true, storageKey: 'bayt-health-auth' } });
