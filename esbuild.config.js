import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const pkgFlagIndex = args.indexOf("--package");
if (pkgFlagIndex === -1 || pkgFlagIndex + 1 >= args.length) {
  console.error("Missing --package <path>");
  process.exit(1);
}

const packagePath = args[pkgFlagIndex + 1];
const packageDir = path.isAbsolute(packagePath)
  ? packagePath
  : path.resolve(process.cwd(), packagePath);

const entryFile = path.join(packageDir, "mod.ts");
try {
  await fs.access(entryFile);
} catch {
  console.error(`Expected entrypoint: ${entryFile}`);
  process.exit(1);
}

// recursively discover .ts files
async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "dist") continue;
      yield* walk(full);
    } else if (e.isFile() && e.name.endsWith(".ts")) {
      if (e.name.endsWith(".test.ts")) continue;
      if (e.name.endsWith(".bench.ts")) continue;
      yield full;
    }
  }
}
const allTs = [];
for await (const f of walk(packageDir)) allTs.push(f);

const rewriteTsImports = {
  name: "rewrite-ts-imports",
  setup(build) {
    build.onLoad({ filter: /\.[tj]s$/ }, async args => {
      const source = await fs.readFile(args.path, "utf8");
      const rewritten = source.replace(
        /from\s+["'](\.?\.?\/[^"']+)\.ts["']/g,
        (_, importPath) => `from "${importPath}.js"`
      );
      return {
        contents: rewritten,
        loader: path.extname(args.path).slice(1),
      };
    });
  },
};

console.log('Building with esbuild...');

let success = false;

try {
  await esbuild.build({
    entryPoints: allTs,
    outdir: path.join(packageDir, "dist"),
    format: "esm",
    bundle: false,
    sourcemap: false,
    splitting: false,
    platform: "node",
    target: "esnext",
    logLevel: "info",
    loader: { ".ts": "ts" },
    plugins: [rewriteTsImports],
  });

  success = true;
}
catch (e) {
  console.error(`esbuild error: ${e}`);
}

if (!success) process.exit(0);

console.info("Copying source files...");

const distDir = path.join(packageDir, "dist");
await fs.mkdir(distDir, { recursive: true });

for (const f of allTs) {
  const rel = path.relative(packageDir, f);
  const out = path.join(distDir, rel);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.copyFile(f, out);
}

console.info('Done!');