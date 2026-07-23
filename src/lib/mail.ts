import { Resend } from "resend";

const key = process.env.RESEND_API_KEY;
const from = process.env.MAIL_FROM ?? "Secret Share <onboarding@resend.dev>";
const resend = key ? new Resend(key) : null;

export async function sendOtpEmail(to: string, code: string, label: string) {
  const subject = "Your one-time code";
  const what = label ? `“${label}”` : "a secret";
  const text = [
    `Someone shared ${what} with you and it can be opened exactly once.`,
    ``,
    `Your code is: ${code}`,
    ``,
    `It expires in 10 minutes. If you weren't expecting this, ignore this email —`,
    `the secret stays sealed and the sender will see it was never opened.`,
  ].join("\n");

  if (!resend) {
    // Dev fallback so the flow is testable without an email provider wired up.
    console.log(`\n[mail] to=${to} subject=${subject}\n${text}\n`);
    return;
  }

  const { error } = await resend.emails.send({ from, to, subject, text });
  if (error) throw new Error(`send failed: ${error.message}`);
}
