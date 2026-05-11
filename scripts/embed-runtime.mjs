import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const start = "    <!-- runtime:start -->";
const end = "    <!-- runtime:end -->";

const result = await build({
  entryPoints: ["command-center.mjs"],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  write: false,
  logLevel: "silent",
});

const bundle = result.outputFiles[0].text
  .replace(/\t/g, "  ")
  .split("\n")
  .map((line) => line.replace(/[ \t]+$/g, ""))
  .join("\n");
const html = await readFile("index.html", "utf8");
const startIndex = html.indexOf(start);
const endIndex = html.indexOf(end);

if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
  throw new Error("Runtime markers not found in index.html");
}

const replacement = `${start}
    <script>
${bundle
  .split("\n")
  .map((line) => (line ? `      ${line}` : ""))
  .join("\n")}
    </script>
    ${end}`;

const nextHtml = `${html.slice(0, startIndex)}${replacement}${html.slice(endIndex + end.length)}`;
await writeFile("index.html", nextHtml);
