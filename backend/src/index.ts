import {Elysia} from "elysia";
import {cors} from "@elysiajs/cors";
import {authRoutes} from "./routes/auth";
import {cleanerRoutes} from "./routes/cleaner";
import {supervisorRoutes} from "./routes/supervisor";
import {adminRoutes} from "./routes/admin";
import {feedbackRoutes} from "./routes/feedback";
import {syncRoutes} from "./routes/sync";
import {cleanerFlowRoutes} from "./routes/cleaner-flow";
import {clientRequestsRoutes} from "./routes/client-requests";
import {config} from "./utils/config";
import {runMigrations} from "./database/migrate";

await runMigrations();

const app = new Elysia()
  .use(cors())
  .get("/", () => "School Hackathon Backend API")
  .use(authRoutes)
  .use(cleanerRoutes)
  .use(cleanerFlowRoutes)
  .use(supervisorRoutes)
  .use(adminRoutes)
  .use(feedbackRoutes)
  .use(clientRequestsRoutes)
  .use(syncRoutes)
  .listen(config.PORT);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);
