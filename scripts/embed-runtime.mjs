import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const indexPath = new URL("../index.html", import.meta.url);
const runtimePath = new URL("../command-center.mjs", import.meta.url);
const startMarker = "<!-- runtime:start -->";
const endMarker = "<!-- runtime:end -->";

const result = await build({
  entryPoints: [runtimePath.pathname],
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  logLevel: "silent",
});

const bundle = result.outputFiles[0].text.trimEnd();
const html = await readFile(indexPath, "utf8");
const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker);

if (start === -1 || end === -1 || end <= start) {
  throw new Error(`Could not find ${startMarker} and ${endMarker} in index.html`);
}

const lineStart = html.lastIndexOf("\n", start) + 1;
const lineIndent = html.slice(lineStart, start);
const replacement = [
  `${lineIndent}${startMarker}`,
  `${lineIndent}<script>`,
  bundle,
  `${lineIndent}</script>`,
  `${lineIndent}${endMarker}`,
].join("\n");

const nextHtml = `${html.slice(0, lineStart)}${replacement}${html.slice(end + endMarker.length)}`;

await writeFile(indexPath, nextHtml);
console.log(`Embedded ${bundle.length} bytes from command-center.mjs into index.html`);
