"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const db_1 = require("./config/db");
const env_1 = require("./config/env");
const http_1 = require("./middleware/http");
async function main() {
    await (0, db_1.connectDb)();
    const app = (0, app_1.createApp)();
    const server = app.listen(env_1.env.PORT, () => http_1.logger.info(`API listening on :${env_1.env.PORT}`, { env: env_1.env.NODE_ENV }));
    const shutdown = (signal) => {
        http_1.logger.info(`${signal} received, shutting down`);
        server.close(async () => {
            await (0, db_1.disconnectDb)();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
}
main().catch((err) => {
    http_1.logger.error("Failed to start", {
        error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
});
//# sourceMappingURL=server.js.map