import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { jwt } from "@elysiajs/jwt";

export const platformAuthRoutes = new Elysia({
  prefix: "/platform/auth",
})
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
      exp: "24h",
    }),
  )

  // -------------------------------------------------------------------
  // 1. LOGIN – Super Admin Only
  // -------------------------------------------------------------------
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      const email = body.email.toLowerCase().trim();

      const admin = await prisma.systemAdmin.findFirst({
        where: { email, isActive: true },
      });

      if (
        !admin ||
        !(await bcrypt.compare(body.password, admin.passwordHash))
      ) {
        set.status = 401;
        return { success: false, message: "Invalid credentials" };
      }

      await prisma.systemAdmin.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      });

      const token = await jwt.sign({
        sub: admin.id, // consistent with middleware
        role: admin.role,
      });

      return {
        success: true,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
        token,
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
    },
  )

  // -------------------------------------------------------------------
  // 2. ME – Validate Current Admin Session
  // -------------------------------------------------------------------
  .get("/me", async ({ jwt, set, headers }) => {
    const authHeader = headers["authorization"];
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      set.status = 401;
      return { success: false, message: "Unauthorized: Token required" };
    }

    const payload = await jwt.verify(token);
    if (!payload || payload.role !== "SUPER_ADMIN") {
      set.status = 403;
      return { success: false, message: "Forbidden: Platform access only" };
    }

    const admin = await prisma.systemAdmin.findUnique({
      where: { id: payload.sub as string },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!admin || !admin.isActive) {
      set.status = 404;
      return { success: false, message: "Admin account invalid" };
    }

    return { success: true, admin };
  });
