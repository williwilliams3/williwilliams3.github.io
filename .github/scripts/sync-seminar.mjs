// Usage: node .github/scripts/sync-seminar.mjs ../doctoralthesis/seminar/dist
// Publish the standalone seminar runtime without its source, notes or tests.
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv[2]) throw new Error("Pass the built seminar/dist directory.");
const source = path.resolve(process.argv[2]);
const destination = fileURLToPath(new URL("../../seminar/", import.meta.url));
const original = await readFile(path.join(source, "index.html"), "utf8");
const files = new Set(["vendor/REVEAL-LICENSE", "vendor/katex/LICENSE"]);
const pending = [];

function addAsset(reference, from = "index.html") {
  if (reference.startsWith("data:")) return;
  if (/^(?:[a-z]+:|\/)/i.test(reference)) throw new Error(`Expected a local asset: ${reference}`);
  const pathname = reference.split(/[?#]/, 1)[0];
  const file = path.posix.normalize(path.posix.join(path.posix.dirname(from), pathname));
  if (file === ".." || file.startsWith("../")) throw new Error(`Asset escapes the deck: ${reference}`);
  if (!files.has(file)) {
    files.add(file);
    pending.push(file);
  }
}

for (const [, reference] of original.matchAll(/(?:src|href)=["']([^"']+)["']/g)) addAsset(reference);
while (pending.length) {
  const file = pending.pop();
  await access(path.join(source, file));
  if (!file.endsWith(".css")) continue;
  const css = await readFile(path.join(source, file), "utf8");
  for (const [, reference] of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) addAsset(reference, file);
}
for (const file of files) await access(path.join(source, file));

const frontMatter = "---\nlayout: null\npermalink: /seminar/\nnav: false\nsitemap: false\n---\n";
const robots = '  <meta name="robots" content="noindex, nofollow, noarchive">';
// Jekyll excludes directories called vendor, so publish those files under lib.
const html = frontMatter + original.replace("<head>", `<head>\n${robots}`).replaceAll('"vendor/', '"lib/');
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, "index.html"), html);
for (const file of files) {
  const target = path.join(destination, file.replace(/^vendor\//, "lib/"));
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(source, file), target);
}
console.log(`Updated /seminar/: index and ${files.size} bundled assets.`);
