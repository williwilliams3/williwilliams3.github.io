// Usage: node .github/scripts/sync-lectio.mjs ../doctoralthesis/lectio/dist
// Publish only the deck's runtime files. Notes, archives and rehearsal material
// remain in the thesis project, outside the public website.
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv[2]) throw new Error("Pass the built lectio/dist directory.");
const source = path.resolve(process.argv[2]);
const destination = fileURLToPath(new URL("../../lectio/", import.meta.url));
const original = await readFile(path.join(source, "index.html"), "utf8");
const files = new Set(["vendor/REVEAL-LICENSE"]);
for (const [, reference] of original.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (reference.startsWith("data:")) continue;
  if (/^(?:[a-z]+:|\/)/i.test(reference) || reference.split("/").includes("..")) {
    throw new Error(`Expected a bundled local asset: ${reference}`);
  }
  files.add(reference);
}
// Validate the complete input before updating any files.
for (const file of files) await access(path.join(source, file));
const frontMatter = "---\nlayout: null\npermalink: /lectio/\nnav: false\nsitemap: false\n---\n";
const robots = '  <meta name="robots" content="noindex, nofollow, noarchive">';
// The website excludes directories named vendor. Keep these bundled runtime
// files in lectio/lib without changing the site's global build configuration.
const html = frontMatter + original.replace("<head>", `<head>\n${robots}`).replaceAll('"vendor/', '"lib/');
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, "index.html"), html);
for (const file of files) {
  const target = path.join(destination, file.replace(/^vendor\//, "lib/"));
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(source, file), target);
}
console.log(`Updated /lectio/: index and ${files.size} bundled assets. No notes or archives copied.`);
