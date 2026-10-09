import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Only fast Node tests are part of the standard workflow. Browser fixtures are optional.
const tests = readdirSync('tests')
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `tests/${name}`);
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
