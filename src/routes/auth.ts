import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";
import { Permission, OtpType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { jwt } from "@elysiajs/jwt";
import { createAndSendOtp, verifyOtp } from "../lib/otp";
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  getGoogleUserInfo,
} from "../lib/google-oauth";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  tenantId: true,
  isActive: true,
  emailVerified: true,
  googleId: true,
  userPermissions: { select: { permission: true } },
  stores: { include: { store: true } },
  tenant: { select: { id: true, code: true, name: true } },
} as const;

export const authRoutes = new Elysia()
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
      exp: "7d",
    }),
  )
  .group("/auth", (app) =>
    app
      // -------------------------------------------------------------------
      // 1. REGISTER
      // -------------------------------------------------------------------
      .post(
        "/register",
        async ({ body, jwt, set }) => {
          const email = body.email.toLowerCase().trim();

          const existing = await prisma.user.findFirst({ where: { email } });
          if (existing) {
            set.status = 409;
            return { success: false, message: "Email already registered" };
          }

          const hashedPassword = await bcrypt.hash(body.password, 12);

          const user = await prisma.$transaction(async (tx: any) => {
            const tenant = await tx.tenant.create({
              data: {
                code:
                  body.tenantCode ||
                  `TNT-${Math.random().toString(36).substring(7).toUpperCase()}`,
                name: body.tenantName || `${body.name}'s Organization`,
              },
            });

            const store = await tx.store.create({
              data: {
                tenantId: tenant.id,
                code: `HQ-${Math.random().toString(36).substring(7).toUpperCase()}`,
                name: `${body.name}'s Store`,
              },
            });

            return tx.user.create({
              data: {
                tenantId: tenant.id,
                username: email,
                email,
                passwordHash: hashedPassword,
                name: body.name,
                role: "ADMIN",
                userPermissions: {
                  create: Object.values(Permission).map((permission) => ({
                    permission,
                  })),
                },
                stores: { create: { storeId: store.id, isPrimary: true } },
              },
              select: userSelect,
            });
          });

          createAndSendOtp(
            user.id,
            user.email!,
            OtpType.EMAIL_VERIFICATION,
          ).catch((err) => {
            console.error("Failed to send verification OTP:", err);
          });

          const token = await jwt.sign({
            sub: user.id,
            tenantId: user.tenantId,
            role: user.role,
          });
          return {
            success: true,
            message: "Registration successful. Please verify your email.",
            user,
            token,
          };
        },
        {
          body: t.Object({
            name: t.String(),
            email: t.String({ format: "email" }),
            password: t.String({ minLength: 8 }),
            tenantName: t.Optional(t.String()),
            tenantCode: t.Optional(t.String()),
          }),
        },
      )

      // -------------------------------------------------------------------
      // 2. LOGIN – requires tenantCode
      // -------------------------------------------------------------------
      .post(
        "/login",
        async ({ body, jwt, set, request }) => {
          const email = body.email.toLowerCase().trim();
          if (!body.tenantCode) {
            set.status = 400;
            return { success: false, message: "tenantCode is required." };
          }

          const user = await prisma.user.findFirst({
            where: {
              email,
              isActive: true,
              deletedAt: null,
              tenant: { code: body.tenantCode },
            },
            select: { ...userSelect, passwordHash: true },
          });

          if (
            !user ||
            !(await bcrypt.compare(body.password, user.passwordHash))
          ) {
            set.status = 401;
            return { success: false, message: "Invalid email or password" };
          }

          const ipAddress =
            request.headers.get("x-forwarded-for") || "127.0.0.1";
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date(), lastLoginIP: ipAddress },
          });

          const token = await jwt.sign({
            sub: user.id,
            tenantId: user.tenantId,
            role: user.role,
          });

          const { passwordHash, ...userData } = user;
          return { success: true, user: userData, token };
        },
        {
          body: t.Object({
            email: t.String(),
            password: t.String(),
            tenantCode: t.String(),
          }),
        },
      )

      // -------------------------------------------------------------------
      // 3. VERIFY EMAIL OTP
      // -------------------------------------------------------------------
      .post(
        "/verify-email",
        async ({ body, headers, jwt, set }) => {
          const auth = headers["authorization"];
          if (!auth || !auth.startsWith("Bearer ")) {
            set.status = 401;
            return { success: false, message: "Missing or malformed token" };
          }
          const token = auth.split(" ")[1];
          const payload = await jwt.verify(token);
          if (!payload) {
            set.status = 401;
            return { success: false, message: "Invalid token" };
          }

          const result = await verifyOtp(
            payload.id as string,
            body.code,
            OtpType.EMAIL_VERIFICATION,
          );
          if (!result.valid) {
            set.status = 400;
            return { success: false, message: result.message };
          }

          await prisma.user.update({
            where: { id: payload.id as string },
            data: { emailVerified: true },
          });

          return { success: true, message: "Email verified successfully." };
        },
        {
          body: t.Object({
            code: t.String({ minLength: 6, maxLength: 6 }),
          }),
        },
      )

      // -------------------------------------------------------------------
      // 4. RESEND OTP
      // -------------------------------------------------------------------
      .post("/resend-otp", async ({ headers, jwt, set }) => {
        const auth = headers["authorization"];
        if (!auth || !auth.startsWith("Bearer ")) {
          set.status = 401;
          return { success: false, message: "Missing or malformed token" };
        }
        const token = auth.split(" ")[1];
        const payload = await jwt.verify(token);
        if (!payload) {
          set.status = 401;
          return { success: false, message: "Invalid token" };
        }

        const user = await prisma.user.findUnique({
          where: { id: payload.id as string },
          select: { id: true, email: true, emailVerified: true },
        });

        if (!user || user.emailVerified) {
          set.status = 400;
          return {
            success: false,
            message: "User not found or already verified.",
          };
        }

        try {
          await createAndSendOtp(
            user.id,
            user.email!,
            OtpType.EMAIL_VERIFICATION,
          );
          return { success: true, message: "OTP sent successfully." };
        } catch (error: any) {
          set.status = 429;
          return { success: false, message: error.message };
        }
      })

      // -------------------------------------------------------------------
      // 5. FORGOT PASSWORD
      // -------------------------------------------------------------------
      .post(
        "/forgot-password",
        async ({ body, set }) => {
          const email = body.email.toLowerCase().trim();
          const user = await prisma.user.findFirst({
            where: { email, isActive: true, deletedAt: null },
          });

          if (!user) {
            return {
              success: true,
              message: "If that email exists, a reset code has been sent.",
            };
          }

          try {
            await createAndSendOtp(
              user.id,
              user.email!,
              OtpType.PASSWORD_RESET,
            );
          } catch (error) {
            console.error("Forgot password OTP limit:", error);
          }
          return {
            success: true,
            message: "If that email exists, a reset code has been sent.",
          };
        },
        {
          body: t.Object({
            email: t.String({ format: "email" }),
          }),
        },
      )

      // -------------------------------------------------------------------
      // 6. RESET PASSWORD
      // -------------------------------------------------------------------
      .post(
        "/reset-password",
        async ({ body, set }) => {
          const email = body.email.toLowerCase().trim();
          const user = await prisma.user.findFirst({
            where: { email, isActive: true, deletedAt: null },
          });

          if (!user) {
            set.status = 400;
            return { success: false, message: "Invalid request." };
          }

          const result = await verifyOtp(
            user.id,
            body.code,
            OtpType.PASSWORD_RESET,
          );
          if (!result.valid) {
            set.status = 400;
            return { success: false, message: result.message };
          }

          const hashedPassword = await bcrypt.hash(body.newPassword, 12);
          await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: hashedPassword },
          });

          return { success: true, message: "Password reset successfully." };
        },
        {
          body: t.Object({
            email: t.String({ format: "email" }),
            code: t.String(),
            newPassword: t.String({ minLength: 8 }),
          }),
        },
      )

      // -------------------------------------------------------------------
      // 7. ME – Get current user profile (tenant user)
      // -------------------------------------------------------------------
      .get("/me", async ({ jwt, set, headers }) => {
        const auth = headers["authorization"];
        if (!auth || !auth.startsWith("Bearer ")) {
          set.status = 401;
          return { success: false, message: "Missing or malformed token" };
        }

        const token = auth.split(" ")[1];
        const payload = await jwt.verify(token);
        if (!payload) {
          set.status = 401;
          return { success: false, message: "Invalid token context" };
        }

        const user = await prisma.user.findUnique({
          where: { id: payload.id as string },
          select: userSelect,
        });

        if (!user || !user.isActive) {
          set.status = 404;
          return {
            success: false,
            message: "User profile context unavailable",
          };
        }

        return { success: true, user };
      })

      // -------------------------------------------------------------------
      // 8. GOOGLE OAUTH INITIATE
      // -------------------------------------------------------------------
      .get("/google", ({ set }) => {
        try {
          const url = getGoogleAuthUrl();
          set.redirect = url;
        } catch (error: any) {
          set.status = 500;
          return { success: false, message: error.message };
        }
      })

      // -------------------------------------------------------------------
      // 9. GOOGLE OAUTH CALLBACK
      // -------------------------------------------------------------------
      .get("/google/callback", async ({ query, jwt, set }) => {
        const { code } = query;
        if (!code) {
          set.status = 400;
          return { success: false, message: "Authorization code missing" };
        }

        try {
          const tokenData = await exchangeCodeForTokens(code as string);
          const userInfo = await getGoogleUserInfo(tokenData.access_token);

          const email = userInfo.email.toLowerCase().trim();

          let user = await prisma.user.findFirst({
            where: { email },
            select: userSelect,
          });

          if (!user) {
            const randomSuffix = Math.random()
              .toString(36)
              .substring(7)
              .toUpperCase();
            user = await prisma.$transaction(async (tx: any) => {
              const tenant = await tx.tenant.create({
                data: {
                  code: `TNT-${randomSuffix}`,
                  name: `${userInfo.name}'s Organization`,
                },
              });
              const store = await tx.store.create({
                data: {
                  tenantId: tenant.id,
                  code: `HQ-${randomSuffix}`,
                  name: `${userInfo.name}'s Store`,
                },
              });
              const dummyPassword = await bcrypt.hash(randomSuffix + email, 12);
              return tx.user.create({
                data: {
                  tenantId: tenant.id,
                  username: email,
                  email,
                  passwordHash: dummyPassword,
                  name: userInfo.name,
                  role: "ADMIN",
                  emailVerified: userInfo.verified_email,
                  googleId: userInfo.id,
                  userPermissions: {
                    create: Object.values(Permission).map((permission) => ({
                      permission,
                    })),
                  },
                  stores: { create: { storeId: store.id, isPrimary: true } },
                },
                select: userSelect,
              });
            });
          } else if (!user.googleId) {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                googleId: userInfo.id,
                emailVerified: userInfo.verified_email
                  ? true
                  : user.emailVerified,
              },
            });
          }

          const token = await jwt.sign({
            sub: user!.id,
            tenantId: user!.tenantId,
            role: user!.role,
          });

          return {
            success: true,
            message: "Google login successful",
            user,
            token,
          };
        } catch (error: any) {
          console.error("Google OAuth error:", error);
          set.status = 500;
          return { success: false, message: "Authentication failed" };
        }
      }),
  );
