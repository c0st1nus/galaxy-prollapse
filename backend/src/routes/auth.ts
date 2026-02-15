import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db } from "../database";
import { users } from "../database/schema";
import { eq } from "drizzle-orm";
import { config } from "../utils/config";

// In a real app, use bcrypt or argon2. For hackathon, simple string match or simple hash if desired.
// I'll assume plain text or simple comparison for now as no hashing lib is in package.json.
// The user didn't ask for hashing, but it's best practice. I'll add a comment.

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(
    jwt({
      name: "jwt",
      secret: config.JWT_SECRET,
    })
  )
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      const user = await db.query.users.findFirst({
        where: eq(users.phone, body.phone),
      });

      if (!user || user.password !== body.password) {
        set.status = 401;
        return { message: "Invalid credentials" };
      }

      const token = await jwt.sign({
        id: user.id,
        role: user.role,
      });

      return {
        token,
        user: {
            id: user.id,
            name: user.name,
            role: user.role
        }
      };
    },
    {
      body: t.Object({
        phone: t.String(),
        password: t.String(),
      }),
    }
  );
