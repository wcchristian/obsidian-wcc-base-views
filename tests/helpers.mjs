import { build } from 'esbuild';

/** Compile actual TypeScript with a small host adapter; Obsidian is not a Node package. */
export async function loadModule(entryPoint, obsidian = {}) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: ['obsidian'],
  });
  const module = { exports: {} };
  const require = (name) => {
    if (name !== 'obsidian') throw new Error(`Unexpected external dependency: ${name}`);
    return obsidian;
  };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(
    module,
    module.exports,
    require,
  );
  return module.exports;
}
