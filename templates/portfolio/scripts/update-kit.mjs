#!/usr/bin/env node
// Applies a Pagewright-managed update delivered through the workflow's `repository_dispatch`
// client payload. Runtime/template files are installed before dependency and manifest updates so
// the site stamp never advances without the code required by that release.

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

async function setOutput(name, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) await appendFile(out, `${name}=${value}\n`);
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertManagedPath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").includes("..")
  ) {
    throw new Error(`Refusing unsafe managed update path: ${String(path)}`);
  }
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

// 1) Install managed runtime and template files before advancing the site stamp.
for (const file of Array.isArray(update.files) ? update.files : []) {
  assertManagedPath(file?.path);
  if (typeof file.content !== "string") {
    throw new Error(`Managed update file "${file.path}" has no text content.`);
  }
  const current = await readOptional(file.path);
  if (current !== file.content) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.content, "utf8");
    changed = true;
    console.log(`Updated ${file.path}`);
  }
}

// 2) Apply dependency/devDependency bumps to package.json.
const pkg = JSON.parse(await readFile("package.json", "utf8"));
let packageChanged = false;
for (const field of ["dependencies", "devDependencies"]) {
  const bumps = update[field];
  if (!bumps) continue;
  pkg[field] = pkg[field] || {};
  for (const [name, version] of Object.entries(bumps)) {
    if (pkg[field][name] !== version) {
      pkg[field][name] = version;
      packageChanged = true;
      changed = true;
      console.log(`Set ${field}.${name} = ${version}`);
    }
  }
}
if (packageChanged) {
  await writeFile("package.json", JSON.stringify(pkg, null, 2) + "\n");
}

// 3) Bump the pagewright.json stamp only after its required runtime is present.
const schemaVersion = Number.parseInt(String(update.schemaVersion ?? "0"), 10);
const runtimeMarker =
  typeof update.runtimeMarker === "string"
    ? update.runtimeMarker
    : schemaVersion >= 2
      ? "vendor/pagewright-blocks/src/bindings.ts"
      : null;
if (runtimeMarker) {
  assertManagedPath(runtimeMarker);
  if ((await readOptional(runtimeMarker)) === null) {
    throw new Error(`Managed update is missing required runtime file: ${runtimeMarker}`);
  }
}

if (update.manifestVersion) {
  const stampSource = await readOptional("pagewright.json");
  if (stampSource === null) {
    console.warn("No pagewright.json stamp found to update.");
  } else {
    const stamp = JSON.parse(stampSource);
    if (stamp.manifestVersion !== update.manifestVersion) {
      stamp.manifestVersion = update.manifestVersion;
      if (update.schemaVersion) stamp.schemaVersion = update.schemaVersion;
      stamp.updatedAt = new Date().toISOString().slice(0, 10);
      await writeFile("pagewright.json", JSON.stringify(stamp, null, 2) + "\n");
      changed = true;
      console.log(`Stamped manifestVersion = ${update.manifestVersion}`);
    }
  }
}

await setOutput("changed", String(changed));
console.log(changed ? "Managed update applied." : "Already up to date.");
