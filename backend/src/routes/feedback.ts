import {Elysia, t} from "elysia";
import {db} from "../database";
import {companies, feedback, objects} from "../database/schema";
import {and, asc, eq} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";
import {normalizeUserRole} from "../utils/roles";

export const feedbackRoutes = new Elysia({prefix: "/feedback"})
    .use(
        jwt({
            name: "jwt",
            secret: config.JWT_SECRET,
        })
    )
    .derive(async ({headers, jwt, set}) => {
        const auth = headers["authorization"];
        if (!auth) {
            set.status = 401;
            throw new Error("Unauthorized");
        }
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
        const profile = await jwt.verify(token);
        if (!profile) {
            set.status = 401;
            throw new Error("Unauthorized");
        }
        const role = normalizeUserRole(profile.role);
        if (!role) {
            set.status = 403;
            throw new Error("Forbidden: only clients can manage feedback");
        }
        const user: JwtPayload = {
            id: Number(profile.id),
            role,
            company_id: Number(profile.company_id),
        };
        if (user.role !== "client") {
            set.status = 403;
            throw new Error("Forbidden: only clients can manage feedback");
        }
        return {user};
    })
    // list available objects for this client's company (for feedback creation UI)
    .get("/objects", async ({query, set}) => {
        const companyRows = await db.select({id: companies.id})
            .from(companies)
            .where(eq(companies.id, query.company_id))
            .limit(1);
        if (!companyRows.length) {
            set.status = 404;
            return {message: "Company not found"};
        }

        const result = await db.select({
            id: objects.id,
            address: objects.address,
            description: objects.description,
        })
            .from(objects)
            .where(eq(objects.company_id, query.company_id))
            .orderBy(asc(objects.id));

        return result;
    }, {
        query: t.Object({
            company_id: t.Integer(),
        }),
    })
    // list feedback left by this client
    .get("/my", async ({user, query}) => {
        const conditions = [eq(feedback.client_id, user.id)];
        if (query.company_id !== undefined) {
            conditions.push(eq(objects.company_id, query.company_id));
        }

        const result = await db.select({
            feedback: feedback,
            object: objects,
        })
            .from(feedback)
            .innerJoin(objects, eq(feedback.object_id, objects.id))
            .where(and(...conditions));

        return result;
    }, {
        query: t.Object({
            company_id: t.Optional(t.Integer()),
        }),
    })
    // create new feedback for an object
    .post("/", async ({body, user, set}) => {
        // verify object belongs to same company
        const obj = await db.select().from(objects).where(
            and(eq(objects.id, body.object_id), eq(objects.company_id, body.company_id))
        );
        if (!obj.length) {
            set.status = 403;
            return {message: "Object does not belong to your company"};
        }

        const newFeedback = await db.insert(feedback).values({
            object_id: body.object_id,
            client_id: user.id,
            rating: body.rating,
            text: body.text,
        }).returning();

        return newFeedback[0];
    }, {
        body: t.Object({
            company_id: t.Integer(),
            object_id: t.Integer(),
            rating: t.Integer({minimum: 1, maximum: 5}),
            text: t.Optional(t.String()),
        })
    })
    // update own feedback
    .patch("/:id", async ({params, body, user, set}) => {
        const feedbackId = parseInt(params.id);

        const updated = await db.update(feedback)
            .set({
                rating: body.rating,
                text: body.text,
            })
            .where(and(eq(feedback.id, feedbackId), eq(feedback.client_id, user.id)))
            .returning();

        if (!updated.length) {
            set.status = 404;
            return {message: "Feedback not found or not yours"};
        }

        return updated[0];
    }, {
        body: t.Object({
            rating: t.Optional(t.Integer({minimum: 1, maximum: 5})),
            text: t.Optional(t.String()),
        })
    })
    // delete own feedback
    .delete("/:id", async ({params, user, set}) => {
        const feedbackId = parseInt(params.id);

        const deleted = await db.delete(feedback)
            .where(and(eq(feedback.id, feedbackId), eq(feedback.client_id, user.id)))
            .returning();

        if (!deleted.length) {
            set.status = 404;
            return {message: "Feedback not found or not yours"};
        }

        return {message: "Feedback deleted successfully"};
    });
