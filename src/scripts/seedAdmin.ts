import { connectDb, disconnectDb } from "../config/db";
import { User } from "../models/User";
import { hashPassword } from "../controllers/auth.controller";
import { emailSchema, passwordSchema } from "../helpers";

/** Creates the first administrator. Reads credentials from the environment so no password is ever committed. */
async function main(): Promise<void> {
  const email = emailSchema.parse(process.env.SEED_ADMIN_EMAIL);
  const password = passwordSchema.parse(process.env.SEED_ADMIN_PASSWORD);
  const name = process.env.SEED_ADMIN_NAME ?? "Parish Administrator";

  await connectDb();
  if (await User.exists({ email })) {
    console.log("An account with that email already exists. Nothing changed.");
  } else {
    await User.create({
      name,
      email,
      role: "admin",
      passwordHash: await hashPassword(password),
    });
    console.log(`Administrator created: ${email}`);
  }
  await disconnectDb();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
