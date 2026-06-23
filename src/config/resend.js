const { Resend } = require('resend');

// API key comes from RESEND_API in FistoUp-Backend/.env.
const resend = new Resend(process.env.RESEND_API);


const FROM = process.env.RESEND_FROM || 'Fisto Up <onboarding@resend.dev>';


function sendVerificationEmail(to, code) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Verify your Fisto Up email',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto">
        <h2 style="color:#0f5630">Verify your email</h2>
        <p>Your Fisto Up verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px;color:#111827">${code}</p>
        <p style="color:#6b7280;font-size:13px">This code is valid for 10 minutes. If you didn't request it, you can ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { resend, sendVerificationEmail };
