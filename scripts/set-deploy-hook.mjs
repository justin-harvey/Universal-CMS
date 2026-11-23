// mail-first-cms — store the Netlify build hook in deploy_control (M3)
//
//   node --env-file=.env scripts/set-deploy-hook.mjs <hook_url>
//
// The publish->rebuild trigger (0003_deploy_trigger.sql) and the Studio
// "Deploy now" button are safe no-ops until deploy_control.hook_url is set.
// This writes it once, using the service-role key (bypasses RLS; deploy_control
// has RLS on with no anon/auth policies). Pass the hook URL as the first arg, or
// set NETLIFY_BUILD_HOOK_URL in the env. Re-runnable (upserts the singleton row).

import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const hookUrl = process.argv[2] || process.env.NETLIFY_BUILD_HOOK_URL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env');
  process.exit(1);
}
if (!hookUrl || !/^https:\/\/api\.netlify\.com\/build_hooks\//.test(hookUrl)) {
  console.error('Pass a Netlify build hook URL (https://api.netlify.com/build_hooks/...) as arg 1 or NETLIFY_BUILD_HOOK_URL');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { error } = await sb
  .from('deploy_control')
  .upsert({ id: 1, hook_url: hookUrl }, { onConflict: 'id' });
if (error) {
  console.error('Failed to set hook_url:', error.message);
  process.exit(1);
}

const { data, error: readErr } = await sb
  .from('deploy_control')
  .select('id, hook_url, debounce_seconds, last_triggered_at')
  .eq('id', 1)
  .single();
if (readErr) {
  console.error('Wrote hook_url but could not read it back:', readErr.message);
  process.exit(1);
}

console.log('✓ deploy_control updated:');
console.log(`    hook_url         = ${data.hook_url}`);
console.log(`    debounce_seconds = ${data.debounce_seconds}`);
console.log(`    last_triggered_at= ${data.last_triggered_at ?? '(never)'}`);
