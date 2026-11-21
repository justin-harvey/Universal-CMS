/**
 * The one file a new site edits.
 *
 * Every organisation-specific fact the site shows — its name, contact details,
 * the timezone events are read in, the document categories, the first
 * administrator's email, the inbound email address content is mailed to — lives
 * here and nowhere else. Change these values and the whole site follows;
 * nothing organisation-specific is hard-coded in a page, a component, or a
 * collection.
 *
 * This file is industry-agnostic by design. It carries a nonprofit, a town, a
 * church, or a club equally well: the labels are generic ("Organisation", not
 * "Town") and the content model underneath (announcements, events, documents,
 * groups, FAQs) is the same for everyone. Pick different `documentCategories`
 * and `groupLabel` and the same engine dresses up as any of them.
 *
 * Content (the announcements, events, rosters, FAQ answers) is NOT here: that
 * is editable in the Studio admin and/or arrives by email. This file is for the
 * identity and settings a developer sets once when standing the site up.
 *
 * ────────────────────────────────────────────────────────────────────
 *  THIS IS THE BLANK TEMPLATE.
 *  The values below are placeholders for a fictional organisation.
 *  Run `npm run setup` to replace them, or edit this file by hand.
 * ────────────────────────────────────────────────────────────────────
 */

export type OfficeHours = {
  /** e.g. "Tuesday, Wednesday & Friday" */
  days: string;
  /** e.g. "8:30 AM – 4:30 PM", or "Closed" */
  hours: string;
};

export type SiteConfig = {
  /** The organisation name on its own: "Harbor Light Food Bank". */
  name: string;
  /** The full legal/display name, if different. Falls back to `name`. */
  legalName: string;
  /** One line shown under the name in some contexts. */
  tagline: string;
  /** IANA zone event times are entered and read in. Defaults to Eastern. */
  timezone: string;
  /** Canonical origin, e.g. "https://example.netlify.app". Env overrides. */
  siteUrl: string;
  /** The first admin account `npm run setup` / the seed creates. */
  firstAdminEmail: string;
  /** Appended to the browser tab title inside the Studio admin. */
  adminTitleSuffix: string;

  /**
   * Email-to-publish settings. The address senders mail content to, and the
   * classifier confidence below which an email is held for human review
   * instead of auto-publishing (PRD §3.1).
   */
  email: {
    /** The inbound address, e.g. "post@example.org". Shown in the Studio help. */
    inboundAddress: string;
    /** Where the "From" is matched; see the approved_senders table. */
    reviewThreshold: number; // 0..1, default 0.85 — below this => pending_review
    /** Hours a signed one-click "Undo / Unpublish" link stays valid. */
    undoWindowHours: number;
    /** Address the admin notification for held/queued emails is sent to. */
    adminNotifyAddress: string;
  };

  contact: {
    /** "Main Office" — the name of the building/office, or null to hide. */
    officeName: string | null;
    addressLine: string;
    cityStateZip: string;
    phone: string;
    email: string;
    officeHours: OfficeHours[];
  };

  hero: {
    /** Alt text for the home-page hero image, if one is dropped in public/hero/. */
    alt: string;
    /** The single sentence of home-page intro copy beneath the hero. */
    intro: string;
  };

  /**
   * What this org calls its "Groups" collection: "Committees", "Departments",
   * "Ministries", "Teams". Drives the nav label and page heading; the schema is
   * the same regardless.
   */
  groupLabel: string;

  /** Categories a document can be filed under. First one is the default. */
  documentCategories: string[];

  /**
   * External links the org points at instead of hosting (PRD §5 out-of-scope:
   * payments/donations are links, not built-in). Null entries are hidden.
   */
  externalLinks: {
    donate: string | null;
    volunteer: string | null;
    newsletter: string | null;
  };
};

export const site: SiteConfig = {
  name: "Example Organisation",
  legalName: "Example Organisation, Inc.",
  tagline: "A placeholder organisation. Edit site.config.ts.",
  timezone: "America/New_York",
  siteUrl: "http://localhost:4321",
  firstAdminEmail: "deanburke10@gmail.com",
  adminTitleSuffix: " · Example Organisation",

  email: {
    inboundAddress: "post@example.org",
    reviewThreshold: 0.85,
    undoWindowHours: 24,
    adminNotifyAddress: "deanburke10@gmail.com",
  },

  contact: {
    officeName: "Main Office",
    addressLine: "1 Main Street",
    cityStateZip: "Anytown, ST 00000",
    phone: "(000) 555-0000",
    email: "info@example.org",
    officeHours: [{ days: "Monday – Friday", hours: "9:00 AM – 5:00 PM" }],
  },

  hero: {
    alt: "Placeholder. No hero image is set yet.",
    intro:
      "This is a placeholder home page. Edit the intro in site.config.ts, and add content through the Studio at /studio — or simply email it in.",
  },

  groupLabel: "Groups",

  documentCategories: [
    "Announcements & Notices",
    "Newsletters",
    "Policies",
    "Forms & Applications",
    "Financial Reports",
    "Agendas & Minutes",
  ],

  externalLinks: {
    donate: null,
    volunteer: null,
    newsletter: null,
  },
};

/** Full display name used in titles and the masthead. */
export const siteDisplayName = site.legalName || site.name;
