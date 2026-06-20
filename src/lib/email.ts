import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendEmail = async (options: {
  to: string;
  subject: string;
  html: string;
}) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("SMTP credentials missing. Email not sent:", options.to, options.subject);
    return;
  }
  
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"POS System" <noreply@pos.local>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    console.log("Message sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email");
  }
};

export const sendOtpEmail = async (to: string, code: string, type: string) => {
  let subject = "";
  let message = "";
  
  switch (type) {
    case "EMAIL_VERIFICATION":
      subject = "Verify Your Email - POS System";
      message = `Your email verification code is <b>${code}</b>. It is valid for ${process.env.OTP_EXPIRY_MINUTES || "10"} minutes.`;
      break;
    case "PASSWORD_RESET":
      subject = "Password Reset - POS System";
      message = `Your password reset code is <b>${code}</b>. It is valid for ${process.env.OTP_EXPIRY_MINUTES || "10"} minutes.`;
      break;
    case "LOGIN":
      subject = "Login OTP - POS System";
      message = `Your login OTP is <b>${code}</b>. It is valid for ${process.env.OTP_EXPIRY_MINUTES || "10"} minutes.`;
      break;
    case "REGISTER":
      subject = "Registration - POS System";
      message = `Your registration code is <b>${code}</b>. It is valid for ${process.env.OTP_EXPIRY_MINUTES || "10"} minutes.`;
      break;
    default:
      subject = "Your OTP Code";
      message = `Your OTP code is <b>${code}</b>.`;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
      <h2 style="color: #333; text-align: center;">POS System</h2>
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; text-align: center;">
        <p style="font-size: 16px; color: #555;">${message}</p>
        <div style="margin: 20px 0; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #000;">${code}</div>
        <p style="font-size: 14px; color: #888;">If you did not request this code, please ignore this email.</p>
      </div>
    </div>
  `;

  return sendEmail({ to, subject, html });
};
