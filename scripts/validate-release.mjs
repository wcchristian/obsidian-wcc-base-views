import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifest = await json('manifest.json');
const pkg = await json('package.json');
const lock = await json('package-lock.json');
const versions = await json('versions.json');
assert.match(
  manifest.version,
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
  'Use a stable semantic version',
);
assert.equal(pkg.version, manifest.version, 'Package and manifest versions must match');
assert.equal(lock.version, pkg.version, 'Lockfile version must match');
assert.equal(lock.packages[''].version, pkg.version, 'Lockfile root package must match');
assert.equal(versions[manifest.version], manifest.minAppVersion, 'Record the minimum app version');
assert.ok(
  !/obsidian|plugin/i.test(manifest.description),
  'Description must omit Obsidian and plugin',
);
assert.equal(pkg.license, 'MIT');
assert.match(await readFile('LICENSE', 'utf8'), /MIT License/);
for (const path of ['main.js', 'manifest.json', 'styles.css']) {
  assert.ok((await stat(path)).size > 0, `Release asset ${path} must exist and not be empty`);
}
const tag = process.argv.find((arg) => arg.startsWith('--tag='))?.slice(6);
if (tag) assert.equal(tag, manifest.version, 'Release tag must match the manifest version');
console.log(`Release ${manifest.version}: metadata, license, and all three assets verified.`);
