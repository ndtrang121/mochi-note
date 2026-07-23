const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function bumpVersion(version, releaseType = 'patch') {
  const match = VERSION_PATTERN.exec(version);
  if (!match) throw new Error(`Unsupported version: ${version}. Expected x.y.z.`);

  const [, majorText, minorText, patchText] = match;
  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);

  if (releaseType === 'major') return `${major + 1}.0.0`;
  if (releaseType === 'minor') return `${major}.${minor + 1}.0`;
  if (releaseType === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unsupported release type: ${releaseType}. Use patch, minor, or major.`);
}

export function updateWxtManifestVersion(source, currentVersion, nextVersion) {
  const currentDeclaration = `version: '${currentVersion}',`;
  const matches = source.split(currentDeclaration).length - 1;
  if (matches !== 1) {
    throw new Error(`Expected exactly one WXT manifest version matching ${currentVersion}; found ${matches}.`);
  }
  return source.replace(currentDeclaration, `version: '${nextVersion}',`);
}
