"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../config/db");
const User_1 = require("../models/User");
const auth_controller_1 = require("../controllers/auth.controller");
const helpers_1 = require("../helpers");
/** Creates the first administrator. Reads credentials from the environment so no password is ever committed. */
async function main() {
    const email = helpers_1.emailSchema.parse(process.env.SEED_ADMIN_EMAIL);
    const password = helpers_1.passwordSchema.parse(process.env.SEED_ADMIN_PASSWORD);
    const name = process.env.SEED_ADMIN_NAME ?? "Parish Administrator";
    await (0, db_1.connectDb)();
    if (await User_1.User.exists({ email })) {
        console.log("An account with that email already exists. Nothing changed.");
    }
    else {
        await User_1.User.create({
            name,
            email,
            role: "admin",
            passwordHash: await (0, auth_controller_1.hashPassword)(password),
        });
        console.log(`Administrator created: ${email}`);
    }
    await (0, db_1.disconnectDb)();
}
main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
//# sourceMappingURL=seedAdmin.js.map