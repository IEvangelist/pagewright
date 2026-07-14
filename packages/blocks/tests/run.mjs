import { rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const outputDir = new URL("../.test-dist/", import.meta.url);
writeFileSync(new URL("package.json", outputDir), '{"type":"commonjs"}\n');

try {
  const result = spawnSync(process.execPath, ["--test", "tests/post-components.test.cjs"], {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}
