#!/usr/bin/env node
// Applies a Pagewright-managed update delivered through the workflow's `repository_dispatch`
// client payload. The payload may contain `{ manifestVersion, schemaVersion, dependencies,
// devDependencies }`. Dependency versions are written into package.json and the pagewright.json
// stamp is bumped. Sets a `changed` step output so the workflow only opens a PR when needed.

import { appendFile, readFile, writeFile } from "node:fs/promises";

async function setOutput(name, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) await appendFile(out, `${name}=${value}\n`);
}

let payload = {};
try {
  payload = process.env.PAGEWRIGHT_UPDATE ? JSON.parse(process.env.PAGEWRIGHT_UPDATE) : {};
} catch {
  console.warn("PAGEWRIGHT_UPDATE was not valid JSON; treating as empty.");
}

// Support both the wrapped event shape and a bare manifest object.
const update = payload.client_payload ?? payload;

if (!update || Object.keys(update).length === 0) {
  console.log(
    "No update payload provided. Pagewright dispatches managed updates with the new manifest.",
  );
  await setOutput("changed", "false");
  process.exit(0);
}

let changed = false;

// 1) Apply dependency/devDependency bumps to package.json.
const pkg = JSON.parse(await readFile("package.json", "utf8"));
for (const field of ["dependencies", "devDependencies"]) {
  const bumps = update[field];
  if (!bumps) continue;
  pkg[field] = pkg[field] || {};
  for (const [name, version] of Object.entries(bumps)) {
    if (pkg[field][name] !== version) {
      pkg[field][name] = version;
      changed = true;
      console.log(`Set ${field}.${name} = ${version}`);
    }
  }
}
if (changed) {
  await writeFile("package.json", JSON.stringify(pkg, null, 2) + "\n");
}

// 2) Bump the pagewright.json stamp.
if (update.manifestVersion) {
  try {
    const stamp = JSON.parse(await readFile("pagewright.json", "utf8"));
    if (stamp.manifestVersion !== update.manifestVersion) {
      stamp.manifestVersion = update.manifestVersion;
      if (update.schemaVersion) stamp.schemaVersion = update.schemaVersion;
      stamp.updatedAt = new Date().toISOString().slice(0, 10);
      await writeFile("pagewright.json", JSON.stringify(stamp, null, 2) + "\n");
      changed = true;
      console.log(`Stamped manifestVersion = ${update.manifestVersion}`);
    }
  } catch {
    console.warn("No pagewright.json stamp found to update.");
  }
}

await setOutput("changed", String(changed));
console.log(changed ? "Managed update applied." : "Already up to date.");
