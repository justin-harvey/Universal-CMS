// Astro content collections — the typed shape of the materialized content.
//
// At build time scripts/materialize.mjs pulls every PUBLISHED row from Supabase
// and writes it as markdown into src/content/<collection>/. These schemas are
// the contract between that step and the (M6) public pages. A fresh clone with
// no database simply has empty collections, and the site still builds.
import { defineCollection, z } from 'astro:content';

const announcements = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    publish_date: z.string().optional(),
    expires_on: z.string().optional(),
    pinned: z.boolean().default(false),
  }),
});

const events = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    starts_at: z.string(),
    ends_at: z.string().optional(),
    location: z.string().default(''),
    status: z.enum(['scheduled', 'cancelled', 'rescheduled']).default('scheduled'),
    media_url: z.string().default(''),
  }),
});

const documents = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    category: z.string().default(''),
    // NB: no `slug` here — Astro reserves it and derives it from the filename.
    // materialize.mjs writes each document as <slug>.md, so entry.slug IS the
    // slug. The slug still arrives in frontmatter; zod simply ignores the extra
    // key. Use `entry.slug` (not `entry.data.slug`) when building file links.
    legacy_url: z.string().default(''),
    adopted_on: z.string().optional(),
    accessibility_checked: z.string().default('not_checked'),
  }),
});

const groups = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    schedule: z.string().default(''),
    contact_name: z.string().default(''),
    contact_email: z.string().default(''),
    sort_order: z.number().default(100),
  }),
});

const faqs = defineCollection({
  type: 'content',
  schema: z.object({
    question: z.string(),
    sort_order: z.number().default(100),
  }),
});

export const collections = { announcements, events, documents, groups, faqs };
