import { rmSync } from "node:fs";

const mode = process.argv[2] === "full" ? "full" : "generated";
const targets =
  mode === "full"
    ? [".next/cache", ".next/types", ".next", "tsconfig.tsbuildinfo"]
    : [".next/cache", ".next/types", "tsconfig.tsbuildinfo"];

for (const target of targets) {
  try {
    rmSync(target, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  } catch {
    // Cleanup must stay best-effort for local DX.
  }
}
