// middlewares/auth.ts
import { Elysia } from "elysia";
// import { jwt } from "@elysiajs/jwt";
import jwt from "@elysiajs/jwt";

export const authMiddleware = new Elysia().derive(async ({ request, set }) => {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    set.status = 401;
    throw new Error("Unauthorized: Missing or invalid token");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    return { user: decoded };
  } catch (error) {
    set.status = 401;
    throw new Error("Unauthorized: Invalid token");
  }
});
