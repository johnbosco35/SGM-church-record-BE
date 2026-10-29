import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { csrfProtection } from "./middleware/csrf";
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
} from "./middleware/http";
import { generalLimiter } from "./middleware/rateLimit";
import { noSqlInjectionGuard } from "./middleware/sanitize";
import { buildOpenApiDocument } from "./routes/define";
import { mountApi } from "./routes";
import "./models";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY > 0) app.set("trust proxy", env.TRUST_PROXY);

  app.use(requestLogger);

  app.use(
    helmet({
      // This is a JSON API: lock the CSP right down. Swagger UI gets its own relaxed policy below.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );

  app.use(
    cors({
      origin: (origin, cb) =>
        cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token"],
      exposedHeaders: ["X-Request-Id", "Content-Disposition"],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: `${env.BODY_LIMIT_KB}kb` }));
  app.use(cookieParser());
  app.use(noSqlInjectionGuard);

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  mountApi(app, [generalLimiter, csrfProtection]);

  if (env.docsEnabled) {
    const spec = buildOpenApiDocument();
    app.get("/api/docs.json", (_req, res) => {
      res.json(spec);
    });
    app.use(
      "/api/docs",
      helmet({ contentSecurityPolicy: false }),
      swaggerUi.serve,
      swaggerUi.setup(spec),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
