import {Elysia} from "elysia";
import {cors} from "@elysiajs/cors";
import {authRoutes} from "./routes/auth";
import {cleanerRoutes} from "./routes/cleaner";
import {supervisorRoutes} from "./routes/supervisor";
import {adminRoutes} from "./routes/admin";
import {feedbackRoutes} from "./routes/feedback";
import {syncRoutes} from "./routes/sync";
import {config} from "./utils/config";
import {runMigrations} from "./database/migrate";

await runMigrations();

const app = new Elysia()
  .use(cors())
  .get("/", () => "School Hackathon Backend API")
  .use(authRoutes)
  .use(cleanerRoutes)
  .use(syncRoutes)
  .use(supervisorRoutes)
  .use(adminRoutes)
    .use(feedbackRoutes)
  .listen(config.PORT);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);
