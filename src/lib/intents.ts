// The four email intents the classifier maps a message to (PRD §3.1), plus the
// JSON schema the model is constrained to. Kept as data so both the Netlify
// classifier function and any test harness share one definition.

export type EmailIntent =
  | "announcement"      // news, notices, general updates (optional expiry)
  | "scheduled_event"   // dated event/meeting/service (timezone-aware)
  | "status_alert"      // cancellation / closure / urgent banner
  | "media_link";       // external video/livestream URL

export interface Classification {
  intent: EmailIntent;
  confidence: number;          // 0..1 — below site.email.reviewThreshold => pending_review
  title: string;
  /** Markdown body for announcements / event descriptions. */
  body: string;
  /** ISO 8601 local instant for scheduled_event / status_alert; else "". */
  startsAt: string;
  endsAt: string;
  location: string;
  /** External media URL for media_link; else "". */
  mediaUrl: string;
  /** True when the sender asked for a layout/structural edit a human must do. */
  needsHuman: boolean;
  /** One line explaining the classification, for the review queue. */
  reasoning: string;
}

// JSON Schema for output_config.format. additionalProperties:false and every
// field required, per structured-output constraints. The timezone is injected
// into the prompt (from site.config), not the schema.
export const CLASSIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["announcement", "scheduled_event", "status_alert", "media_link"],
    },
    confidence: { type: "number" },
    title: { type: "string" },
    body: { type: "string" },
    startsAt: { type: "string" },
    endsAt: { type: "string" },
    location: { type: "string" },
    mediaUrl: { type: "string" },
    needsHuman: { type: "boolean" },
    reasoning: { type: "string" },
  },
  required: [
    "intent", "confidence", "title", "body",
    "startsAt", "endsAt", "location", "mediaUrl", "needsHuman", "reasoning",
  ],
} as const;
