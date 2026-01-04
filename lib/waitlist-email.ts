import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.RESEND_FROM!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function sendWelcomeEmail(email: string, token: string) {
  const unsubUrl = `${APP_URL}/waitlist/unsubscribe?token=${encodeURIComponent(token)}`;

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "VQCC – Díky! Jsi na waitlistu ✅",
    html: `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
        <h2>Díky! Jsi na waitlistu ✅</h2>
        <p>Jakmile budeme launchovat, pošleme ti e-mail.</p>
        <p style="margin-top:24px;font-size:12px;color:#666">
          Nechceš už e-maily? <a href="${unsubUrl}">Odhlásit</a>
        </p>
      </div>
    `,
  });
}

export async function sendLaunchEmail(email: string, token: string) {
  const unsubUrl = `${APP_URL}/waitlist/unsubscribe?token=${encodeURIComponent(token)}`;
  const appUrl = `${APP_URL}/auth/signup`;

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "VQCC je venku 🚀",
    html: `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
        <h2>VQCC je venku 🚀</h2>
        <p>Můžeš se zaregistrovat a nahrát první video:</p>
        <p><a href="${appUrl}">${appUrl}</a></p>

        <p style="margin-top:24px;font-size:12px;color:#666">
          Nechceš už e-maily? <a href="${unsubUrl}">Odhlásit</a>
        </p>
      </div>
    `,
  });
}
