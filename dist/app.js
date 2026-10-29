"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const env_1 = require("./config/env");
const csrf_1 = require("./middleware/csrf");
const http_1 = require("./middleware/http");
const rateLimit_1 = require("./middleware/rateLimit");
const sanitize_1 = require("./middleware/sanitize");
const define_1 = require("./routes/define");
const routes_1 = require("./routes");
require("./models");
function createApp() {
    const app = (0, express_1.default)();
    app.disable("x-powered-by");
    if (env_1.env.TRUST_PROXY > 0)
        app.set("trust proxy", env_1.env.TRUST_PROXY);
    app.use(http_1.requestLogger);
    app.use((0, helmet_1.default)({
        // This is a JSON API: lock the CSP right down. Swagger UI gets its own relaxed policy below.
        contentSecurityPolicy: {
            directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
        },
        crossOriginResourcePolicy: { policy: "same-site" },
        referrerPolicy: { policy: "no-referrer" },
    }));
    app.use((0, cors_1.default)({
        origin: (origin, cb) => cb(null, !origin || env_1.env.corsOrigins.includes(origin)),
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        allowedHeaders: ["Content-Type", "X-CSRF-Token"],
        exposedHeaders: ["X-Request-Id", "Content-Disposition"],
        maxAge: 600,
    }));
    app.use(express_1.default.json({ limit: `${env_1.env.BODY_LIMIT_KB}kb` }));
    app.use((0, cookie_parser_1.default)());
    app.use(sanitize_1.noSqlInjectionGuard);
    app.get("/healthz", (_req, res) => {
        res.json({ status: "ok" });
    });
    (0, routes_1.mountApi)(app, [rateLimit_1.generalLimiter, csrf_1.csrfProtection]);
    if (env_1.env.docsEnabled) {
        const spec = (0, define_1.buildOpenApiDocument)();
        app.get("/api/docs.json", (_req, res) => {
            res.json(spec);
        });
        app.use("/api/docs", (0, helmet_1.default)({ contentSecurityPolicy: false }), swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(spec));
    }
    app.use(http_1.notFoundHandler);
    app.use(http_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map