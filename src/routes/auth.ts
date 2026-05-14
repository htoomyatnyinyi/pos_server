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
    })
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
        { set.status = 400; return "User already exists"; }}

      const hashedPassword = await bcrypt.hash(body.password, 10);

      const user = await prisma.user.create({
        data: {
          username: body.email,
          email: body.email,
          passwordHash: hashedPassword,
          name: body.name,
        },
      });

      const token = await jwt.sign({
        id: user.id,
      });

      return {
        id: user.id,
        name: user.name,
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
    async ({ body, jwt, set }) => {
      const user = await prisma.user.findUnique({
        where: {
          email: body.email,
        },
      });

      if (!user) {
        { set.status = 400; return "Invalid credentials"; }}

      const validPassword = await bcrypt.compare(
        body.password,
        user.passwordHash,
      );

      if (!validPassword) {
        { set.status = 400; return "Invalid credentials"; }}

      const token = await jwt.sign({
        id: user.id,
      });

      return {
        id: user.id,
        name: user.name,
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
