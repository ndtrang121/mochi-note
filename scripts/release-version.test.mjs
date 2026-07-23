import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bumpVersion, updateWxtManifestVersion } from './release-version.mjs';

describe('release version helpers', () => {
  it('bumps patch, minor, and major releases', () => {
    assert.equal(bumpVersion('0.1.1', 'patch'), '0.1.2');
    assert.equal(bumpVersion('0.1.1', 'minor'), '0.2.0');
    assert.equal(bumpVersion('0.1.1', 'major'), '1.0.0');
  });

  it('updates the matching WXT manifest version', () => {
    assert.equal(
      updateWxtManifestVersion("manifest: { version: '0.1.1', name: 'Mochi' }", '0.1.1', '0.1.2'),
      "manifest: { version: '0.1.2', name: 'Mochi' }",
    );
  });

  it('rejects invalid versions and release types', () => {
    assert.throws(() => bumpVersion('0.1', 'patch'), /Expected x\.y\.z/);
    assert.throws(() => bumpVersion('0.1.1', 'beta'), /Use patch, minor, or major/);
  });
});
