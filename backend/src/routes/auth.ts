import {Elysia, t} from "elysia";
import {jwt} from "@elysiajs/jwt";
import {db} from "../database";
import {companies, users} from "../database/schema";
import {eq} from "drizzle-orm";
import {config} from "../utils/config";


export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(
    jwt({
      name: "jwt",
      secret: config.JWT_SECRET,
    })
  )
  .post(
    "/register-company",
    async ({ body, jwt }) => {
        const hashedPassword = await Bun.password.hash(body.password);

        // atomic: company + admin user in one transaction
        const {company, user} = await db.transaction(async (tx) => {
            const company = await tx.insert(companies).values({
                name: body.companyName
            }).returning();

            if (!company.length) {
                throw new Error("Failed to create company");
            }

            const user = await tx.insert(users).values({
                company_id: company[0].id,
                name: body.adminName,
                role: "admin",
                email: body.email,
                password: hashedPassword
            }).returning();

            return {company, user};
        });

      const token = await jwt.sign({
          id: String(user[0].id),
        role: user[0].role,
          company_id: String(user[0].company_id)
      });

      return {
        token,
        user: {
            id: user[0].id,
            name: user[0].name,
            role: user[0].role,
            company_id: user[0].company_id
        },
        company: company[0]
      };
    },
    {
      body: t.Object({
        companyName: t.String(),
        adminName: t.String(),
        email: t.String(),
        password: t.String()
      })
    }
  )
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      const user = await db.query.users.findFirst({
        where: eq(users.email, body.email),
      });

        if (!user || !(await Bun.password.verify(body.password, user.password))) {
        set.status = 401;
        return { message: "Invalid credentials" };
      }

      const company = await db.select().from(companies).where(eq(companies.id, user.company_id));

      const token = await jwt.sign({
          id: String(user.id),
        role: user.role,
          company_id: String(user.company_id)
      });

      return {
        token,
        user: {
            id: user.id,
            name: user.name,
            role: user.role,
            company_id: user.company_id
        },
        company: company[0]
      };
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    }
  );
