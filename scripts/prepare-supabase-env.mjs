import { readFile, writeFile } from 'node:fs/promises';

const envFiles = [
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
];

for (const envFile of envFiles) {
  let bytes;
  try {
    bytes = await readFile(envFile);
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }

  const hasUtf8Bom = bytes.length >= 3
    && bytes[0] === 0xef
    && bytes[1] === 0xbb
    && bytes[2] === 0xbf;

  if (!hasUtf8Bom) continue;

  await writeFile(envFile, bytes.subarray(3));
  globalThis.console.log(`Normalized UTF-8 BOM in ${envFile}.`);
}
