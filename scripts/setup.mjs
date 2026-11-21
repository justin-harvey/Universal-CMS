// mail-first-cms — one-command provisioning (M1)
//
//   npm run setup
//
// Adapted from Hope-Maine's scripts/setup.ts (rewritten as plain Node, no tsx).
// Asks a short series of questions, then does everything that can be done inside
// the repository: rewrites the identity block of site.config.ts and writes a
// .env from .env.example with your values filled in. It then prints the
// checklist of what must be provisioned OUTSIDE the repo (the Supabase project,
// storage, Postmark inbound, the Netlify build hook) — see SETUP.md.
//
// Safe to re-run: current values are shown as defaults.

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONFIG = path.join(ROOT, 'site.config.ts');
const ENV = path.join(ROOT, '.env');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');

const rl = readline.createInterface({ input, output });
const ask = async (q, def) => {
  const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
  return a || def || '';
};

// Replace a `key: "..."` or `key: value` line inside the top-level `site` object.
// Keeps this intentionally simple: it edits the obvious identity fields and
// leaves the structure/comments of site.config.ts intact.
function setField(src, key, value, quote = true) {
  const v = quote ? JSON.stringify(value) : value;
  const re = new RegExp(`(\\n\\s*${key}:\\s*)("[^"]*"|[^,\\n]+)(,)`);
  if (!re.test(src)) {
    console.warn(`  (could not find field "${key}" in site.config.ts — set it by hand)`);
    return src;
  }
  return src.replace(re, `$1${v}$3`);
}

async function main() {
  console.log('\nmail-first-cms setup\n────────────────────\n');

  const name = await ask('Organisation name', 'Example Organisation');
  const legalName = await ask('Full legal/display name', `${name}`);
  const tagline = await ask('Tagline', 'A placeholder organisation.');
  const timezone = await ask('IANA timezone', 'America/New_York');
  const siteUrl = await ask('Canonical site URL', 'http://localhost:4321');
  const firstAdminEmail = await ask('First admin email', 'admin@example.org');
  const inboundAddress = await ask('Inbound email address (email-to-publish)', 'post@example.org');
  const groupLabel = await ask('Word for "Groups" (Committees/Ministries/Teams)', 'Groups');

  let cfg = readFileSync(CONFIG, 'utf8');
  cfg = setField(cfg, 'name', name);
  cfg = setField(cfg, 'legalName', legalName);
  cfg = setField(cfg, 'tagline', tagline);
  cfg = setField(cfg, 'timezone', timezone);
  cfg = setField(cfg, 'siteUrl', siteUrl);
  cfg = setField(cfg, 'firstAdminEmail', firstAdminEmail);
  cfg = setField(cfg, 'adminTitleSuffix', ` · ${name}`);
  cfg = setField(cfg, 'inboundAddress', inboundAddress);
  cfg = setField(cfg, 'adminNotifyAddress', firstAdminEmail);
  cfg = setField(cfg, 'groupLabel', groupLabel);
  writeFileSync(CONFIG, cfg);
  console.log('\n✓ site.config.ts updated');

  // .env — start from the example, fill what we know, generate the undo secret.
  let env = existsSync(ENV) ? readFileSync(ENV, 'utf8')
    : existsSync(ENV_EXAMPLE) ? readFileSync(ENV_EXAMPLE, 'utf8') : '';
  const undoSecret = randomBytes(32).toString('hex');
  const setEnv = (k, v) => {
    const re = new RegExp(`^${k}=.*$`, 'm');
    env = re.test(env) ? env.replace(re, `${k}=${v}`) : env + `\n${k}=${v}`;
  };
  setEnv('PUBLIC_SITE_URL', siteUrl);
  setEnv('UNDO_SIGNING_SECRET', undoSecret);
  writeFileSync(ENV, env);
  console.log('✓ .env written (UNDO_SIGNING_SECRET generated)');

  console.log(`
Next — provision the services the repo can't (see SETUP.md):
  1. Create a Supabase project; run the migrations in supabase/migrations/ in order.
  2. Put SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and PUBLIC_SUPABASE_* in .env and Netlify.
  3. Invite yourself:  npm run invite ${firstAdminEmail} admin
  4. Create a Netlify build hook; store it:
       update public.deploy_control set hook_url='...' where id=1;
  5. Point Postmark Inbound at  https://<site>/api/inbound-email  and set the tokens.
  6. Add your address to approved_senders, then email ${inboundAddress} to test.
`);
  rl.close();
}

main().catch((e) => { console.error(e); rl.close(); process.exit(1); });
