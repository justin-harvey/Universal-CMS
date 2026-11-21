// Outbound mail for the email-to-publish pipeline (PRD §3.1 / M4).
//
// Sends three kinds of transactional mail: a publish receipt (with a one-click
// undo link) back to the sender, a polite reject auto-reply, and an admin
// notification when something is held for review. Uses Postmark's REST API —
// the same provider that delivers inbound mail to the webhook (see
// POSTMARK_SERVER_TOKEN in .env.example), so no extra dependency and no SMTP.
//
// GRACEFUL NO-OP: if POSTMARK_SERVER_TOKEN / MAIL_FROM are unset the pipeline
// still runs — mail is skipped and logged. That keeps the webhook working in
// dev and before outbound is provisioned.
//
// LOOP PREVENTION (PRD §5): every outbound message carries
//   Auto-Submitted: auto-replied
//   X-Auto-Response-Suppress: All
// so a recipient's vacation-responder won't ping-pong with our confirmations.

interface SendArgs {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export async function sendMail({ to, subject, text, replyTo }: SendArgs): Promise<boolean> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.MAIL_FROM;
  if (!token || !from) {
    console.log(`[mailer] skipped (no POSTMARK_SERVER_TOKEN/MAIL_FROM): would send "${subject}" to ${to}`);
    return false;
  }
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: from,
        To: to,
        Subject: subject,
        TextBody: text,
        ReplyTo: replyTo,
        Headers: [
          { Name: "Auto-Submitted", Value: "auto-replied" },
          { Name: "X-Auto-Response-Suppress", Value: "All" },
        ],
        MessageStream: process.env.POSTMARK_OUTBOUND_STREAM || "outbound",
      }),
    });
    if (!res.ok) {
      console.error(`[mailer] Postmark ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[mailer] send failed: ${(e as Error).message}`);
    return false;
  }
}

// ── message bodies ───────────────────────────────────────────────────────────

export function receiptEmail(args: {
  siteName: string;
  title: string;
  liveUrl: string;
  undoUrl: string;
  accessibilityWarning?: boolean;
}) {
  const lines = [
    `Your update "${args.title}" has been published to ${args.siteName}.`,
    ``,
    `It will be live in about 30 seconds here:`,
    args.liveUrl,
  ];
  if (args.accessibilityWarning) {
    lines.push(
      ``,
      `Note: the PDF you sent looks like a scanned image, so screen readers can't`,
      `read it. If you can, reply with a version that has selectable text.`,
    );
  }
  lines.push(
    ``,
    `Made a mistake? Undo / unpublish this update (link expires soon):`,
    args.undoUrl,
  );
  return { subject: `Published to ${args.siteName}: ${args.title}`, text: lines.join("\n") };
}

export function rejectEmail(args: { siteName: string; reason: string }) {
  return {
    subject: `We couldn't publish your email to ${args.siteName}`,
    text: [
      `Thanks for your email. We weren't able to publish it automatically.`,
      ``,
      args.reason,
      ``,
      `Reply to this message if you'd like a hand.`,
    ].join("\n"),
  };
}

export function heldSenderEmail(args: { siteName: string }) {
  return {
    subject: `Thanks — your update to ${args.siteName} needs a quick review`,
    text: [
      `Thanks! Your message needs a quick manual review before it goes live.`,
      `We'll update the site shortly.`,
    ].join("\n"),
  };
}

export function adminNotifyEmail(args: {
  siteName: string; subject: string; fromEmail: string; reason: string; studioUrl: string;
}) {
  return {
    subject: `[${args.siteName}] Email held for review: ${args.subject || "(no subject)"}`,
    text: [
      `An inbound email is waiting in the review queue.`,
      ``,
      `From: ${args.fromEmail}`,
      `Subject: ${args.subject || "(no subject)"}`,
      `Why held: ${args.reason}`,
      ``,
      `Review and approve it in Studio:`,
      args.studioUrl,
    ].join("\n"),
  };
}
