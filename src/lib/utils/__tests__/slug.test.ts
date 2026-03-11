import { describe, it, expect } from 'vitest';
import { generateSlug } from '@/lib/utils/slug';

describe('generateSlug', () => {
  it('converts a normal name to a slug', () => {
    expect(generateSlug('My Project')).toBe('my-project');
  });

  it('handles multiple spaces and mixed case', () => {
    expect(generateSlug('Hello   World')).toBe('hello-world');
  });

  it('strips special characters', () => {
    expect(generateSlug('foo@bar#baz!')).toBe('foo-bar-baz');
  });

  it('handles accented characters by removing them', () => {
    expect(generateSlug('café résumé')).toBe('caf-r-sum');
  });

  it('returns already-slugified input unchanged', () => {
    expect(generateSlug('already-slugified')).toBe('already-slugified');
  });

  it('trims leading and trailing spaces', () => {
    expect(generateSlug('  padded name  ')).toBe('padded-name');
  });

  it('collapses consecutive non-alphanumeric characters into a single dash', () => {
    expect(generateSlug('a---b___c')).toBe('a-b-c');
  });

  it('strips leading and trailing dashes after conversion', () => {
    expect(generateSlug('---hello---')).toBe('hello');
  });

  it('throws on empty string', () => {
    expect(() => generateSlug('')).toThrow('contains no URL-safe characters');
  });

  it('throws on string with no URL-safe characters', () => {
    expect(() => generateSlug('!@#$%^&*()')).toThrow('contains no URL-safe characters');
  });

  it('throws on whitespace-only string', () => {
    expect(() => generateSlug('   ')).toThrow('contains no URL-safe characters');
  });

  it('handles numeric input', () => {
    expect(generateSlug('123 456')).toBe('123-456');
  });
});
