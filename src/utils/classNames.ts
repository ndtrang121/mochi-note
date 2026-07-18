type ClassValue = false | null | string | undefined;

export function classNames(...values: ClassValue[]) {
  return values.filter(Boolean).join(' ');
}
