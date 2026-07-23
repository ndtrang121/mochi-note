import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { bumpVersion, updateWxtManifestVersion } from './release-version.mjs';

const releaseType = process.argv[2] ?? 'patch';
const packagePath = new URL('../package.json', import.meta.url);
const wxtConfigPath = new URL('../wxt.config.ts', import.meta.url);

const originalPackageSource = await readFile(packagePath, 'utf8');
const originalWxtConfig = await readFile(wxtConfigPath, 'utf8');
const packageJson = JSON.parse(originalPackageSource);
const currentVersion = packageJson.version;
const nextVersion = bumpVersion(currentVersion, releaseType);

packageJson.version = nextVersion;
const nextPackageSource = `${JSON.stringify(packageJson, null, 2)}\n`;
const nextWxtConfig = updateWxtManifestVersion(originalWxtConfig, currentVersion, nextVersion);

await writeFile(packagePath, nextPackageSource);
await writeFile(wxtConfigPath, nextWxtConfig);

console.log(`Version bumped: ${currentVersion} -> ${nextVersion}`);
console.log('Building Chrome extension...');

const pnpmEntrypoint = process.env.npm_execpath;
const build = pnpmEntrypoint
  ? spawnSync(process.execPath, [pnpmEntrypoint, 'build'], { stdio: 'inherit' })
  : spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['build'], { stdio: 'inherit' });

if (build.status !== 0) {
  await Promise.all([
    writeFile(packagePath, originalPackageSource),
    writeFile(wxtConfigPath, originalWxtConfig),
  ]);
  throw new Error(`Release build failed; restored version ${currentVersion}.`);
}

console.log(`Release ${nextVersion} built successfully in .output/chrome-mv3.`);
