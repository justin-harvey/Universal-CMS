// The email intents the classifier maps a message to (PRD §3.1), plus the JSON
// schema the model is constrained to. Kept as data so both the Netlify
// classifier function and any test harness share one definition.
//
// Six intents, matching the public.email_intent DB enum (0004) and the Studio's
// INTENT_TO_COLLECTION map (M5):
//   announcement / scheduled_event / status_alert / media_link / document / unknown
// `document` is an emailed file (PDF) to publish to the library; `unknown` is a
// request a human must handle (layout/design/billing or anything off-model) and
// is always routed to review.

export type EmailIntent =
  | "announcement"      // news, notices, general updates (optional expiry/pin)
  | "scheduled_event"   // dated event/meeting/service (timezone-aware)
  | "status_alert"      // cancellation / closure / urgent banner
  | "media_link"        // external video/livestream URL
  | "document"          // an attached PDF (bulletin/agenda/newsletter/form)
  | "unknown";          // off-model request — always held for a human

export interface Classification {
  intent: EmailIntent;
  confidence: number;          // 0..1 — below site.email.reviewThreshold => pending_review
  title: string;
  /** 1–2 sentence plain-text summary for cards/meta. */
  summary: string;
  /** Markdown body for announcements / event descriptions / document cover note. */
  body: string;
  /** Document category (for intent=document); else "". */
  category: string;
  /** ISO 8601 local instant for scheduled_event / status_alert; else "". */
  startsAt: string;
  endsAt: string;
  location: string;
  /** Event lifecycle for scheduled_event/status_alert; "" otherwise. */
  eventStatus: "scheduled" | "cancelled" | "rescheduled" | "";
  /** ISO date an announcement should drop off the site; else "". */
  expiresAt: string;
  /** Pin an announcement to the top. */
  pinned: boolean;
  /** External media URL for media_link; else "". */
  mediaUrl: string;
  /** True when the sender asked for something a human must do (intent=unknown). */
  needsHuman: boolean;
  /** One line explaining the classification, for the review queue. */
  reasoning: string;
}

// JSON Schema for output_config.format. additionalProperties:false and every
// field required, per structured-output constraints. The timezone + current
// local time are injected into the prompt (from site.config), not the schema.
export const CLASSIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["announcement", "scheduled_event", "status_alert", "media_link", "document", "unknown"],
    },
    confidence: { type: "number" },
    title: { type: "string" },
    summary: { type: "string" },
    body: { type: "string" },
    category: { type: "string" },
    startsAt: { type: "string" },
    endsAt: { type: "string" },
    location: { type: "string" },
    eventStatus: { type: "string", enum: ["scheduled", "cancelled", "rescheduled", ""] },
    expiresAt: { type: "string" },
    pinned: { type: "boolean" },
    mediaUrl: { type: "string" },
    needsHuman: { type: "boolean" },
    reasoning: { type: "string" },
  },
  required: [
    "intent", "confidence", "title", "summary", "body", "category",
    "startsAt", "endsAt", "location", "eventStatus", "expiresAt", "pinned",
    "mediaUrl", "needsHuman", "reasoning",
  ],
} as const;
