import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { jwt } from "@elysiajs/jwt";

export const authRoutes = new Elysia({
  prefix: "/auth",
})
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    }),
  )
  .post(
    "/register",
    async ({ body, jwt, set }) => {
      const existingUser = await prisma.user.findUnique({
        where: {
          email: body.email,
        },
      });

      if (existingUser) {
        set.status = 400;
        return { message: "User already exists" };
      }

      const hashedPassword = await bcrypt.hash(body.password, 10);

      const emailLower = body.email.toLowerCase().trim();
      const user = await prisma.user.create({
        data: {
          username: emailLower,
          email: emailLower,
          passwordHash: hashedPassword,
          name: body.name,
          role: "ADMIN",
          stores: {
            create: [
              {
                store: {
                  create: {
                    code: `HQ-${Date.now()}`,
                    name: `${body.name}'s Store`,
                  },
                },
                isPrimary: true,
              },
            ],
          },
        },
        include: {
          stores: {
            include: {
              store: true,
            },
          },
        },
      });

      const token = await jwt.sign({
        id: user.id,
        premium: user.premium,
        trial: user.trial,
      });

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        premium: user.premium,
        trial: user.trial,
        stores: user.stores.map((s: any) => s.store),
        token,
      };
    },
    {
      body: t.Object({
        name: t.String(),
        email: t.String(),
        password: t.String(),
      }),
    },
  )
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      const emailLower = body.email.toLowerCase().trim();
      console.log(`[AUTH] Login attempt for: ${emailLower}`);

      const user = await prisma.user.findUnique({
        where: {
          email: emailLower,
        },
        include: {
          stores: {
            include: {
              store: true,
            },
          },
        },
      });

      if (!user) {
        console.log(`[AUTH] User not found: ${emailLower}`);
        set.status = 400;
        return { message: "Invalid credentials" };
      }

      const validPassword = await bcrypt.compare(
        body.password,
        user.passwordHash,
      );

      if (!validPassword) {
        console.log(`[AUTH] Password mismatch for: ${emailLower}`);
        set.status = 400;
        return { message: "Invalid credentials" };
      }

      console.log(`[AUTH] Login successful for: ${emailLower} (${user.role})`);

      const token = await jwt.sign({
        id: user.id,
        premium: user.premium,
        trial: user.trial,
      });

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        stores: user.stores.map((s: any) => s.store),
        token,
        premium: user.premium,
        trial: user.trial,
      };
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    },
  )
  .get("/me", async ({ jwt, set, headers }) => {
    const authHeader = headers["authorization"];
    if (!authHeader) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const token = authHeader.split(" ")[1];
    const payload = await jwt.verify(token);

    if (!payload) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: {
        id: payload.id as string,
      },
      include: {
        stores: {
          include: {
            store: true,
          },
        },
      },
    });

    if (!user) {
      set.status = 404;
      return { message: "User not found" };
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      stores: user.stores.map((s: any) => s.store),
      token, // Keep the same token
    };
  });
