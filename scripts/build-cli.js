#!/usr/bin/env node
import * as esbuild from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { readFileSync, chmodSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// Read package.json to get all dependencies
const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const allDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];

// Plugin to strip shebangs from source files (they get bundled otherwise)
const stripShebangPlugin = {
  name: "strip-shebang",
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      const source = readFileSync(args.path, "utf8");
      // Remove shebang if present
      const contents = source.replace(/^#!.*\n/, "");
      return { contents, loader: "ts" };
    });
  },
};

async function build() {
  const entryPoints = [
    { entry: "src/agent/cli/interactive.ts", outfile: "bin/multica-interactive.mjs" },
    { entry: "src/agent/cli/non-interactive.ts", outfile: "bin/multica-cli.mjs" },
    { entry: "src/agent/cli/profile.ts", outfile: "bin/multica-profile.mjs" },
  ];

  for (const { entry, outfile } of entryPoints) {
    console.log(`Building ${entry} -> ${outfile}...`);

    await esbuild.build({
      entryPoints: [resolve(rootDir, entry)],
      outfile: resolve(rootDir, outfile),
      bundle: true,
      platform: "node",
      target: "node20",
      format: "esm",
      banner: {
        js: "#!/usr/bin/env node",
      },
      plugins: [stripShebangPlugin],
      sourcemap: true,
      minify: false,
      // Externalize all dependencies - they will be loaded from node_modules at runtime
      external: allDeps,
    });

    // Make executable
    chmodSync(resolve(rootDir, outfile), 0o755);
    console.log(`  ✓ ${outfile}`);
  }

  console.log("\nBuild complete! Binaries are in ./bin/");
  console.log("\nUsage:");
  console.log("  node bin/multica-interactive.mjs  # Interactive CLI");
  console.log("  node bin/multica-cli.mjs          # Non-interactive CLI");
  console.log("  node bin/multica-profile.mjs      # Profile management");
  console.log("\nNote: The built binaries require node_modules to be present.");
  console.log("Run 'pnpm install --prod' to install only production dependencies.");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
