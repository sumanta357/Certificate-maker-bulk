// Chooses the right Prisma schema based on DATABASE_URL so that
// dev (SQLite) and production (PostgreSQL) both get a matching client.
const { execSync } = require("child_process");

const url = process.env.DATABASE_URL || "";
const args = url.startsWith("file:")
  ? ["prisma", "generate", "--schema", "prisma/schema.sqlite.prisma"]
  : ["prisma", "generate"];

try {
  execSync(args.join(" "), { stdio: "inherit" });
} catch (err) {
  console.warn("[postinstall] prisma generate failed (will retry at build time):", err.message);
  process.exit(0);
}
