// mail-first-cms — prebuild materialize: Supabase -> markdown (M2)
//
// Adapted from ebneo-poc's materialize step, generalized to all five
// collections. Pulls every status='published' (events: publish='published')
// row and writes one markdown file per row into src/content/<collection>/, so
// the downstream Astro content-collection / Pagefind / sitemap pipeline bakes
// the current content. Supabase is the source of truth; these files are a build
// artifact, not hand-edited source.
//
// Runs before `astro build` (see package.json "build"). Uses the SERVICE-ROLE
// key, which bypasses RLS and is build-env only — never ship it to a browser.
//
// Graceful offline mode: with no SUPABASE env set (a fresh clone, or CI without
// secrets) it logs and exits 0, leaving the collections empty so the site still
// builds. Set the env to bake real content.

import { createClient } from '@supabase/supabase-js';
import { rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(__dirname, '..', 'src', 'content');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

// Which column carries the draft/published axis, and how each row becomes a
// frontmatter + body markdown file. One entry per collection.
const COLLECTIONS = {
  announcements: {
    pubCol: 'status',
    frontmatter: (r) => ({ title: r.title, publish_date: r.publish_date, expires_on: r.expires_on, pinned: r.pinned }),
    body: (r) => r.body,
  },
  events: {
    pubCol: 'publish',
    frontmatter: (r) => ({ title: r.title, starts_at: r.starts_at, ends_at: r.ends_at, location: r.location, status: r.status, media_url: r.media_url }),
    body: (r) => r.body,
  },
  documents: {
    pubCol: 'status',
    frontmatter: (r) => ({ title: r.title, category: r.category, slug: r.slug, legacy_url: r.legacy_url, adopted_on: r.adopted_on, accessibility_checked: r.accessibility_checked }),
    body: () => '',
  },
  groups: {
    pubCol: 'status',
    frontmatter: (r) => ({ name: r.name, schedule: r.schedule, contact_name: r.contact_name, contact_email: r.contact_email, sort_order: r.sort_order }),
    body: (r) => r.description,
  },
  faqs: {
    pubCol: 'status',
    frontmatter: (r) => ({ question: r.question, sort_order: r.sort_order }),
    body: (r) => r.answer,
  },
};

function yamlValue(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return JSON.stringify(String(v)); // safe double-quoted scalar
}

function toMarkdown(frontmatter, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(frontmatter)) {
    const val = yamlValue(v);
    if (val !== '') lines.push(`${k}: ${val}`);
  }
  lines.push('---', '');
  return lines.join('\n') + (body || '') + '\n';
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[materialize] No SUPABASE env — skipping (collections stay empty). ' +
      'Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to bake content.');
    return;
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  for (const [name, spec] of Object.entries(COLLECTIONS)) {
    const dir = join(CONTENT, name);
    // Clear previously materialized markdown but keep the directory and its
    // committed .gitkeep, so a repo clone keeps non-empty collection folders
    // (Astro warns on a missing collection dir) and the working tree stays
    // clean after a build. Only *.md (what we write) is removed.
    await mkdir(dir, { recursive: true });
    for (const f of await readdir(dir)) {
      if (f.endsWith('.md')) await rm(join(dir, f), { force: true });
    }

    const { data, error } = await db.from(name).select('*').eq(spec.pubCol, 'published');
    if (error) throw new Error(`${name}: ${error.message}`);

    for (const row of data ?? []) {
      const md = toMarkdown(spec.frontmatter(row), spec.body(row));
      await writeFile(join(dir, `${row.slug}.md`), md, 'utf8');
    }
    console.log(`[materialize] ${name}: ${data?.length ?? 0} published`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
