import { build, emptyDir } from 'https://deno.land/x/dnt@0.40.0/mod.ts';

await emptyDir('./npm');

await build({
  entryPoints: ['./mod.ts'],
  outDir: './npm',
  shims: {
    deno: 'dev',
  },
  package: {
    name: 'nspec',
    version: Deno.args[0],
    description: 'Standards-compliant Nostr interfaces and modules in TypeScript.',
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://gitlab.com/soapbox-pub/NSpec.git',
    },
    bugs: {
      url: 'https://gitlab.com/soapbox-pub/NSpec/-/issues',
    },
  },
  postBuild() {
    Deno.copyFileSync('LICENSE', 'npm/LICENSE');
    Deno.copyFileSync('README.md', 'npm/README.md');
  },
});
