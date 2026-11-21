// The email classifier (PRD §3.1) — a single structured Claude call.
//
// Takes a parsed inbound email (subject + plain-text body) plus the site
// timezone and attachment metadata, and returns one of six intents with the
// fields needed to create the right content row. Uses the official Anthropic SDK
// with a schema-constrained response (output_config.format); no free-form JSON.
//
// Model: claude-opus-4-8. A small/fast model (e.g. claude-haiku-4-5) is a
// reasonable cost swap for this narrow task — change MODEL below if desired;
// that is a deliberate choice, not a default we make for you.
//
// ANTHROPIC_API_KEY must be set in the function environment (never PUBLIC_*).

import Anthropic from "@anthropic-ai/sdk";
import { CLASSIFICATION_SCHEMA, type Classification } from "./intents";

const MODEL = "claude-opus-4-8";

const SYSTEM = `You are an automated content ingestion engine for a small organisation's static website CMS. You parse one inbound email from an authorized sender and extract a structured website update.

Classify the email into exactly ONE intent:
- "document": the sender attached one or more PDFs (bulletin, agenda, newsletter, form) to publish to the document library, with or without a short cover note. Prefer this whenever a PDF is attached and the email is about that file.
- "announcement": general news, a notice, a community update, or a policy note to display on the site.
- "scheduled_event": creating a new dated event/meeting, or giving the time/location/description of an upcoming one.
- "status_alert": cancelling, postponing, or issuing an urgent closure/weather alert for an event or the whole organisation.
- "media_link": sharing a video, recording, or livestream URL (YouTube, Vimeo, Facebook Live) to feature on the site.
- "unknown": the sender is asking for custom design/layout work, new navigation, billing help, or anything that cannot be fulfilled by the standard content collections above.

Grounding and anti-hallucination:
- Extract ONLY facts explicitly stated in the email or an attachment filename. Never invent dates, times, phone numbers, addresses, or links.
- Convert relative dates ("this Sunday", "tomorrow at 6pm") to ISO 8601 using the provided CURRENT_LOCAL_TIME and SITE_TIMEZONE. Leave a date field "" if it is not stated.
- Strip email signatures, confidentiality footers, and quoted/forwarded reply chains from the extracted body. Emit body as clean semantic Markdown (headings, lists, bold) with no raw HTML.
- For intent=document set category to the best-fit library category if stated, else "". For scheduled_event/status_alert set eventStatus (scheduled/cancelled/rescheduled); otherwise set it "". Set expiresAt only if the sender says when a notice should come down. Set pinned=true only if they ask to pin/feature it at the top.

Confidence:
- Set confidence 0..1 to your genuine certainty the extraction is correct and safe to auto-publish.
- Set confidence < 0.85 (and intent="unknown" with needsHuman=true for off-model requests) if the email is ambiguous, asks a question, has conflicting dates, or requests manual layout changes.`;

export async function classifyEmail(args: {
  subject: string;
  body: string;
  timezone: string;
  /** Attachment filenames + content types, so the model can see a PDF is present. */
  attachments?: { name: string; contentType: string }[];
  /** ISO instant used to resolve relative dates; defaults to now. */
  now?: string;
  apiKey?: string;
}): Promise<Classification> {
  const client = new Anthropic({ apiKey: args.apiKey ?? process.env.ANTHROPIC_API_KEY });

  const nowIso = args.now ?? new Date().toISOString();
  const atts = (args.attachments ?? []).map((a) => `${a.name} (${a.contentType})`);
  const userText = [
    `SITE_TIMEZONE: ${args.timezone}`,
    `CURRENT_LOCAL_TIME: ${nowIso}`,
    `ATTACHMENTS: ${atts.length ? atts.join(", ") : "none"}`,
    `Subject: ${args.subject}`,
    `Body:\n${args.body}`,
  ].join("\n\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: CLASSIFICATION_SCHEMA } },
    messages: [{ role: "user", content: userText }],
  });

  // Safety classifiers can decline with a 200 + stop_reason "refusal". Treat a
  // refusal as "route to human review", never as a publishable result.
  if (response.stop_reason === "refusal") {
    return {
      intent: "unknown",
      confidence: 0,
      title: args.subject || "(no subject)",
      summary: "",
      body: "",
      category: "",
      startsAt: "", endsAt: "", location: "",
      eventStatus: "", expiresAt: "", pinned: false, mediaUrl: "",
      needsHuman: true,
      reasoning: "Model declined to classify this message; held for human review.",
    };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
  return JSON.parse(raw) as Classification;
}
