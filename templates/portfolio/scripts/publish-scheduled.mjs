#!/usr/bin/env node
// Promotes scheduled content: any page/post document with `draft: true` and a `publishAt`
// timestamp that has passed becomes published (`draft: false`). Pure Node — no dependencies —
// so it runs on a clean GitHub Actions runner without an install step.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const now = new Date();
const dirs = ["src/data/posts", "src/data/pages"];
let changed = 0;

for (const dir of dirs) {
  let files;
  try {
    files = await readdir(dir);
  } catch {
    continue; // Not every template has both folders.
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);

    let doc;
    try {
      doc = JSON.parse(await readFile(path, "utf8"));
    } catch {
      console.warn(`Skipping invalid JSON: ${path}`);
      continue;
    }

    const due = doc.publishAt && new Date(doc.publishAt) <= now;
    if (doc.draft === true && due) {
      doc.draft = false;
      await writeFile(path, JSON.stringify(doc, null, 2) + "\n");
      changed++;
      console.log(`Published: ${path}`);
    }
  }
}

console.log(
  changed === 0 ? "No scheduled content was due." : `Published ${changed} item(s).`,
);
