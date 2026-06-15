import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to_email, otp_code, smtp_host, smtp_port, smtp_user, smtp_password, from_email } = body;

    // Basic authentication: Verify that the provided SMTP password matches our environment variable
    if (!smtp_password || smtp_password !== process.env.SMTP_PASSWORD) {
      console.error("send-email route unauthorized request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Configure nodemailer transporter
    const port = parseInt(smtp_port) || 587;
    const transporter = nodemailer.createTransport({
      host: smtp_host || "smtp.gmail.com",
      port: port,
      secure: port === 465, // true for 465, false for other ports (like 587)
      auth: {
        user: smtp_user,
        pass: smtp_password,
      },
      tls: {
        rejectUnauthorized: false // Avoid SSL handshake errors with some hostnames
      }
    });

    const subject = "FormZero — Your Email Verification Code";
    const plainBody = `Your FormZero verification code is: ${otp_code}\n\nThis code expires in 10 minutes.`;

    const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f6f8; margin: 0; padding: 0; }
        .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px 24px; text-align: center; }
        .header h1 { color: #e0c097; font-size: 22px; margin: 0; letter-spacing: 1px; }
        .body { padding: 32px 24px; text-align: center; }
        .body p { color: #555; font-size: 15px; line-height: 1.6; margin: 0; margin-bottom: 24px; }
        .otp-box { display: inline-block; background: #f0f4ff; border: 2px dashed #4a6cf7; border-radius: 12px; padding: 16px 32px; margin: 8px 0 24px 0; }
        .otp-code { font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; color: #1a1a2e; letter-spacing: 8px; }
        .footer { background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #eee; }
        .footer p { color: #999; font-size: 12px; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>FormZero</h1>
        </div>
        <div class="body">
          <p>Your email verification code is:</p>
          <div class="otp-box">
            <span class="otp-code">${otp_code}</span>
          </div>
          <p>This code expires in <strong>10 minutes</strong>.<br/>If you didn't request this, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 FormZero. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
    `;

    await transporter.sendMail({
      from: from_email || smtp_user,
      to: to_email,
      subject: subject,
      text: plainBody,
      html: htmlBody,
    });

    return NextResponse.json({ status: "success" });
  } catch (error: any) {
    console.error("Nodemailer proxy error:", error);
    return NextResponse.json({ error: error.message || "Failed to send email" }, { status: 500 });
  }
}
