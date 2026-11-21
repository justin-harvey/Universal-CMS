// The email classifier (PRD §3.1) — a single structured Claude call.
//
// Takes a parsed inbound email (subject + plain-text body) plus the site
// timezone, and returns one of the four intents with the fields needed to
// create the right content row. Uses the official Anthropic SDK with a
// schema-constrained response (output_config.format); no free-form JSON parsing.
//
// Model: claude-opus-4-8. A small/fast model (e.g. claude-haiku-4-5) is a
// reasonable cost swap for this narrow task — change MODEL below if desired;
// that is a deliberate choice, not a default we make for you.
//
// ANTHROPIC_API_KEY must be set in the function environment (never PUBLIC_*).

import Anthropic from "@anthropic-ai/sdk";
import { CLASSIFICATION_SCHEMA, type Classification } from "./intents";

const MODEL = "claude-opus-4-8";

const SYSTEM = `You classify a single inbound email from an approved sender into one of four publishing intents for a small organisation's website, and extract the fields needed to publish it. Be faithful to the email: do not invent events, dates, or links that are not present. Dates/times must be emitted as ISO 8601 in the site's timezone. If the sender is asking for a layout or structural change to the site (not a piece of content to publish), set needsHuman=true. Set confidence to your genuine certainty (0..1) that the extraction is correct and safe to auto-publish.`;

export async function classifyEmail(args: {
  subject: string;
  body: string;
  timezone: string;
  apiKey?: string;
}): Promise<Classification> {
  const client = new Anthropic({ apiKey: args.apiKey ?? process.env.ANTHROPIC_API_KEY });

  const userText = [
    `Site timezone: ${args.timezone}`,
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
      intent: "announcement",
      confidence: 0,
      title: args.subject || "(no subject)",
      body: "",
      startsAt: "", endsAt: "", location: "", mediaUrl: "",
      needsHuman: true,
      reasoning: "Model declined to classify this message; held for human review.",
    };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
  return JSON.parse(raw) as Classification;
}
