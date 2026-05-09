import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";

export const authRoutes = new Elysia({
  prefix: "/auth",
})
  .post(
    "/register",
    async ({ body, jwt }) => {
      const existingUser = await prisma.user.findUnique({
        where: {
          email: body.email,
        },
      });

      if (existingUser) {
        throw new Error("User already exists");
      }

      const hashedPassword = await bcrypt.hash(body.password, 10);

      const user = await prisma.user.create({
        data: {
          username: body.email, // Use email as username for now
          email: body.email,
          password: hashedPassword,
          firstName: body.name, // Map name to firstName
        },
      });

      const token = await jwt.sign({
        id: user.id,
      });

      return {
        id: user.id,
        name: user.firstName,
        email: user.email,
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
    async ({ body, jwt }) => {
      const user = await prisma.user.findUnique({
        where: {
          email: body.email,
        },
      });

      if (!user) {
        throw new Error("Invalid credentials");
      }

      if (!user.password) {
        throw new Error("Invalid credentials");
      }

      const validPassword = await bcrypt.compare(body.password, user.password);

      if (!validPassword) {
        throw new Error("Invalid credentials");
      }

      const token = await jwt.sign({
        id: user.id,
      });

      return {
        id: user.id,
        name: user.firstName,
        email: user.email,
        token,
      };
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    },
  );
