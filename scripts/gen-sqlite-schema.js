#!/usr/bin/env node
/**
 * Derives prisma/schema.sqlite.prisma from prisma/schema.prisma:
 *  - datasource provider postgresql -> sqlite
 *  - enum blocks removed (SQLite has no enums; String fields validated in app code)
 *  - enum-typed fields rewritten to String with stringified defaults
 *  - `Json` columns -> String (SQLite has no native Json type)
 */
const fs = require("fs");

const src = fs.readFileSync("prisma/schema.prisma", "utf8");

let out = src;

// 1. Swap the datasource provider
out = out.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"');

// 2. Collect enum names, then remove the enum blocks
const enumNames = [...src.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]);
out = out.replace(/^enum\s+\w+\s*\{[\s\S]*?^\}/gm, "");

// 3. Rewrite enum-typed fields to String (e.g. `role Role` -> `role String`)
if (enumNames.length) {
  const types = enumNames.join("|");
  out = out.replace(new RegExp(`(\\w+\\s+)(${types})(\\??)\\b`, "g"), "$1String$3");
  // Stringify enum defaults (e.g. @default(ADMIN) -> @default("ADMIN")).
  // Uppercase bare-identifier defaults only come from enums in this schema;
  // `now()`, cuid() and numbers are untouched.
  out = out.replace(/@default\(([A-Z][A-Z0-9_]*)\)/g, '@default("$1")');
}

// 4. Replace Json types with String
out = out.replace(/:\s*Json\??/g, (m) => (m.includes("?") ? "String?" : "String"));

// 5. Clean up multiple blank lines
out = out.replace(/\n{3,}/g, "\n\n");

fs.writeFileSync("prisma/schema.sqlite.prisma", out);
console.log("Derived prisma/schema.sqlite.prisma (enums stripped:", enumNames.join(", ") + ")");
