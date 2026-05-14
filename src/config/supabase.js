import { createClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  return raw.replace(/\/rest\/v1$/i, '');
}

export const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
export const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  ''
).trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  supabaseUrl.includes('.supabase.co') &&
  !/\/rest\/v1$/i.test(supabaseUrl) &&
  !supabaseUrl.includes('YOUR_PROJECT_REF') &&
  !supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY') &&
  !supabaseAnonKey.includes('YOUR_SUPABASE_PUBLISHABLE_KEY')
);

export const supabaseConfigError = isSupabaseConfigured
  ? ''
  : 'Supabase is not configured correctly. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY, then restart the Vite dev server.';

function getSupabaseHost(value) {
  try {
    return value ? new URL(value).host : null;
  } catch {
    return 'invalid-url';
  }
}

console.log('[supabase] config', {
  loadedUrl: supabaseUrl,
  hasUrl: Boolean(supabaseUrl),
  urlHost: getSupabaseHost(supabaseUrl),
  urlPath: (() => {
    try {
      return supabaseUrl ? new URL(supabaseUrl).pathname : '';
    } catch {
      return 'invalid-url';
    }
  })(),
  hasAnonKey: Boolean(supabaseAnonKey),
  keyPrefix: supabaseAnonKey ? `${supabaseAnonKey.slice(0, 14)}...` : '',
  configured: isSupabaseConfigured
});

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;
