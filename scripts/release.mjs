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
function runPnpm(scriptName) {
  return pnpmEntrypoint
    ? spawnSync(process.execPath, [pnpmEntrypoint, scriptName], { stdio: 'inherit' })
    : spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [scriptName], { stdio: 'inherit' });
}

async function restoreVersionAndThrow(stage) {
  await Promise.all([
    writeFile(packagePath, originalPackageSource),
    writeFile(wxtConfigPath, originalWxtConfig),
  ]);
  throw new Error(`Release ${stage} failed; restored version ${currentVersion}.`);
}

const build = runPnpm('build');
if (build.status !== 0) {
  await restoreVersionAndThrow('build');
}

console.log('Creating Chrome extension ZIP...');
const zip = runPnpm('zip');
if (zip.status !== 0) {
  await restoreVersionAndThrow('ZIP packaging');
}

console.log(`Release ${nextVersion} built successfully in .output/chrome-mv3 with a ZIP in .output.`);
