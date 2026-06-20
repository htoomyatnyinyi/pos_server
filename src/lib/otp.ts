import { prisma } from "./prisma";
import { sendOtpEmail } from "./email";
import { randomInt } from "crypto";
import { OtpType } from "@prisma/client";

export const generateOtp = (): string => {
  // Generate 6 digit secure random number
  return randomInt(100000, 999999).toString();
};

export const createAndSendOtp = async (userId: string, email: string, type: OtpType) => {
  // 1. Rate limiting check (e.g. max 5 OTPs per 15 mins)
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
  const recentOtps = await prisma.otpVerification.count({
    where: {
      userId,
      type,
      createdAt: { gte: fifteenMinsAgo },
    },
  });

  if (recentOtps >= 5) {
    throw new Error("Rate limit exceeded. Please try again later.");
  }

  // 2. Invalidate previous unused OTPs of the same type for this user
  await prisma.otpVerification.updateMany({
    where: {
      userId,
      type,
      isUsed: false,
    },
    data: {
      isUsed: true, // Soft invalidate them
    },
  });

  // 3. Create new OTP
  const code = generateOtp();
  const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10);
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const otp = await prisma.otpVerification.create({
    data: {
      userId,
      code,
      type,
      expiresAt,
    },
  });

  // 4. Send Email
  await sendOtpEmail(email, code, type);

  return otp;
};

export const verifyOtp = async (userId: string, code: string, type: OtpType) => {
  // 1. Find the latest active OTP for this type
  const otpRecord = await prisma.otpVerification.findFirst({
    where: {
      userId,
      type,
      isUsed: false,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    return { valid: false, message: "No active OTP found. Please request a new one." };
  }

  if (otpRecord.code !== code) {
    return { valid: false, message: "Invalid OTP code." };
  }

  if (otpRecord.expiresAt < new Date()) {
    // Mark as used to prevent reuse
    await prisma.otpVerification.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });
    return { valid: false, message: "OTP has expired. Please request a new one." };
  }

  // Success: mark as used
  await prisma.otpVerification.update({
    where: { id: otpRecord.id },
    data: { isUsed: true },
  });

  return { valid: true, message: "OTP verified successfully." };
};

export const cleanupExpiredOtps = async () => {
  try {
    const deleted = await prisma.otpVerification.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        isUsed: true,
      },
    });
    console.log(`Cleaned up ${deleted.count} expired/used OTPs.`);
  } catch (error) {
    console.error("Error cleaning up OTPs:", error);
  }
};
