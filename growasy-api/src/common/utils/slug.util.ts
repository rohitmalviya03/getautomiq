import { customAlphabet } from 'nanoid';

const suffixGenerator = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .slice(0, 60) || 'workspace'
  );
}

export function slugWithSuffix(value: string): string {
  return `${slugify(value)}-${suffixGenerator()}`;
}
