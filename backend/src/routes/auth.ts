import {Elysia, t} from "elysia";
import {jwt} from "@elysiajs/jwt";
import {db} from "../database";
import {companies, users} from "../database/schema";
import {eq, ilike} from "drizzle-orm";
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
  )
  .post(
    "/register-client",
    async ({ body, jwt, set }) => {
      const companyName = body.companyName.trim();
      if (!companyName) {
        set.status = 400;
        return { message: "Company name is required" };
      }

      const matchedCompanies = await db.select().from(companies).where(ilike(companies.name, companyName));
      if (!matchedCompanies.length) {
        set.status = 404;
        return { message: "Company not found. Please check the company name with your administrator." };
      }
      if (matchedCompanies.length > 1) {
        set.status = 409;
        return { message: "Multiple companies matched this name. Contact your administrator." };
      }

      const hashedPassword = await Bun.password.hash(body.password);
      const fullName = `${body.firstName.trim()} ${body.lastName.trim()}`.trim();
      if (!fullName) {
        set.status = 400;
        return { message: "Client name is required" };
      }

      try {
        const newUser = await db.insert(users).values({
          company_id: matchedCompanies[0].id,
          name: fullName,
          role: "client",
          email: body.email.trim(),
          password: hashedPassword
        }).returning();

        const token = await jwt.sign({
          id: String(newUser[0].id),
          role: newUser[0].role,
          company_id: String(newUser[0].company_id)
        });

        return {
          token,
          user: {
            id: newUser[0].id,
            name: newUser[0].name,
            role: newUser[0].role,
            company_id: newUser[0].company_id
          },
          company: matchedCompanies[0]
        };
      } catch (err: any) {
        if (err?.code === "23505") {
          set.status = 409;
          return { message: "Email is already in use" };
        }
        throw err;
      }
    },
    {
      body: t.Object({
        companyName: t.String(),
        firstName: t.String(),
        lastName: t.String(),
        phone: t.Optional(t.String()),
        email: t.String(),
        password: t.String()
      })
    }
  );
