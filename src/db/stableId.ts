/** IDs are created once and then preserved for the lifetime of an entity. */
export function createStableId(prefix?: string) {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}-${id}` : id;
}

