// Studio collection specs (M5).
//
// One data-driven description per content collection so the CRUD UI, the list
// view, the publish toggle, and the email-approval prefill all read from a
// single source of truth. The shapes mirror supabase/migrations/0002.
//
// Each collection:
//   table        the Postgres table name
//   tabKey       stable key for the tab (label can be overridden, e.g. Groups)
//   titleField   the human label shown in lists + the source of the auto-slug
//   statusField  the draft/published column — 'status' everywhere except events,
//                which uses 'publish' ('status' on events is the event lifecycle)
//   order        default list ordering { col, ascending }
//   fields       the form fields, in display order
//
// Field types the form renderer understands:
//   text | textarea | markdown | date | datetime | checkbox | select | number | file
// `file` is Documents-only (uploads to the private documents bucket).

export const PUBLISH_OPTIONS = [
  { value: 'draft', label: 'Draft (not on the site)' },
  { value: 'published', label: 'Published (live)' },
];

// site.documentCategories is injected at runtime; the Documents `category`
// select options are filled from it in the component.
export const COLLECTIONS = {
  announcements: {
    table: 'announcements',
    tabKey: 'Announcements',
    titleField: 'title',
    statusField: 'status',
    order: { col: 'created_at', ascending: false },
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'slug', label: 'Slug (URL)', type: 'slug', required: true },
      { name: 'body', label: 'Body', type: 'markdown', help: 'Markdown. The announcement text.' },
      { name: 'publish_date', label: 'Publish date', type: 'date' },
      { name: 'expires_on', label: 'Expires on', type: 'date', help: 'Optional. Drops off the site after this date.' },
      { name: 'pinned', label: 'Pin to top', type: 'checkbox' },
      { name: 'status', label: 'Status', type: 'select', options: PUBLISH_OPTIONS },
    ],
  },
  events: {
    table: 'events',
    tabKey: 'Events',
    titleField: 'title',
    statusField: 'publish',
    order: { col: 'starts_at', ascending: false },
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'slug', label: 'Slug (URL)', type: 'slug', required: true },
      { name: 'body', label: 'Description', type: 'markdown', help: 'Markdown.' },
      { name: 'starts_at', label: 'Starts', type: 'datetime', required: true, help: 'Entered in the site timezone.' },
      { name: 'ends_at', label: 'Ends', type: 'datetime' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'media_url', label: 'Livestream / video URL', type: 'text' },
      {
        name: 'status', label: 'Event status', type: 'select', options: [
          { value: 'scheduled', label: 'Scheduled' },
          { value: 'cancelled', label: 'Cancelled (stays visible, struck through)' },
          { value: 'rescheduled', label: 'Rescheduled' },
        ],
      },
      { name: 'publish', label: 'Publish', type: 'select', options: PUBLISH_OPTIONS },
    ],
  },
  documents: {
    table: 'documents',
    tabKey: 'Documents',
    titleField: 'title',
    statusField: 'status',
    order: { col: 'category', ascending: true },
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'slug', label: 'Slug (permanent /documents/file/<slug> URL)', type: 'slug', required: true },
      { name: 'category', label: 'Category', type: 'select', options: 'documentCategories' },
      { name: 'file', label: 'File (PDF)', type: 'file', help: 'Uploads to the private documents bucket.' },
      { name: 'legacy_url', label: 'Fallback link', type: 'text', help: 'Used if no file is uploaded yet.' },
      { name: 'adopted_on', label: 'Adopted / dated', type: 'date' },
      {
        name: 'accessibility_checked', label: 'Accessibility', type: 'select', options: [
          { value: 'not_checked', label: 'Not checked' },
          { value: 'has_text', label: 'Has selectable text (accessible)' },
          { value: 'image_only', label: 'Image-only scan (NOT screen-reader accessible)' },
        ], help: 'A scanned image-only PDF is invisible to a screen reader — flag it.',
      },
      { name: 'status', label: 'Status', type: 'select', options: PUBLISH_OPTIONS },
    ],
  },
  groups: {
    table: 'groups',
    tabKey: 'Groups',
    titleField: 'name',
    statusField: 'status',
    order: { col: 'sort_order', ascending: true },
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'slug', label: 'Slug (URL)', type: 'slug', required: true },
      { name: 'description', label: 'Description', type: 'markdown', help: 'Markdown.' },
      { name: 'schedule', label: 'Schedule', type: 'text', help: 'Free text, e.g. "First Tuesday, 6pm".' },
      { name: 'contact_name', label: 'Contact name', type: 'text' },
      { name: 'contact_email', label: 'Contact email', type: 'text' },
      { name: 'sort_order', label: 'Sort order', type: 'number', help: 'Lower numbers show first.' },
      { name: 'status', label: 'Status', type: 'select', options: PUBLISH_OPTIONS },
    ],
  },
  faqs: {
    table: 'faqs',
    tabKey: 'FAQs',
    titleField: 'question',
    statusField: 'status',
    order: { col: 'sort_order', ascending: true },
    fields: [
      { name: 'question', label: 'Question', type: 'text', required: true },
      { name: 'slug', label: 'Slug (URL)', type: 'slug', required: true },
      { name: 'answer', label: 'Answer', type: 'markdown', help: 'Markdown.' },
      { name: 'sort_order', label: 'Sort order', type: 'number', help: 'Lower numbers show first.' },
      { name: 'status', label: 'Status', type: 'select', options: PUBLISH_OPTIONS },
    ],
  },
};

// Per-field default for a fresh row.
export function fieldDefault(f) {
  switch (f.type) {
    case 'checkbox': return false;
    case 'number': return f.name === 'sort_order' ? 100 : 0;
    case 'select':
      if (f.name === 'accessibility_checked') return 'not_checked';
      if (Array.isArray(f.options)) return f.options[0].value; // e.g. events status -> scheduled, status -> draft
      return ''; // documentCategories resolved at runtime
    default: return '';
  }
}

export function blankRow(spec) {
  const row = {};
  for (const f of spec.fields) {
    if (f.type === 'file') continue; // pseudo-field, not a column
    row[f.name] = fieldDefault(f);
  }
  return row;
}

// ── value <-> input helpers ────────────────────────────────────────────────

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// A timestamptz ISO string -> the value a <input type="datetime-local"> wants,
// expressed in the browser's local time (the admin runs in the site timezone).
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function localInputToIso(v) {
  if (!v) return null;
  const d = new Date(v); // parsed as local wall-clock time
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Build the DB payload from form state, coercing each field to its column type.
// Excludes the `file` pseudo-field; the caller sets storage_path after upload.
export function toPayload(spec, form) {
  const out = {};
  for (const f of spec.fields) {
    if (f.type === 'file') continue;
    let v = form[f.name];
    switch (f.type) {
      case 'datetime': v = localInputToIso(v); break;
      case 'date': v = v || null; break;
      case 'number': v = v === '' || v === null ? null : Number.parseInt(v, 10); break;
      case 'checkbox': v = Boolean(v); break;
      default: v = v ?? '';
    }
    out[f.name] = v;
  }
  return out;
}

// Map an email classifier intent to the collection its approval should prefill.
export const INTENT_TO_COLLECTION = {
  announcement: 'announcements',
  scheduled_event: 'events',
  status_alert: 'events',
  media_link: 'announcements',
  document: 'documents',
  unknown: 'announcements',
};
