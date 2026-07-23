import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const roots = ['src', 'entrypoints', 'public/_locales'];
const patterns = [/Ã/, /áº/, /Ä‘/, /\?\?\?/];
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.css', '.html']);
const failures = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const resolved = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(resolved);
      continue;
    }
    const ext = resolved.slice(resolved.lastIndexOf('.'));
    if (!extensions.has(ext)) continue;
    const text = await readFile(resolved, 'utf8');
    if (patterns.some((pattern) => pattern.test(text))) {
      failures.push(resolved);
    }
  }
}

for (const root of roots) {
  await walk(root);
}

if (failures.length > 0) {
  console.error('Localization audit found mojibake-like text in:');
  for (const file of failures) console.error(`- ${file}`);
  process.exit(1);
}

console.log('Localization audit passed.');
