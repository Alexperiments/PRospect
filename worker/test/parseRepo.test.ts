import { describe, it, expect } from 'vitest';
import { parseRepo } from '../src/parseRepo';

describe('parseRepo', () => {
  it('accepts bare owner/repo slug', () => {
    expect(parseRepo('pytorch/pytorch')).toBe('pytorch/pytorch');
  });

  it('accepts HTTPS URL', () => {
    expect(parseRepo('https://github.com/pytorch/pytorch')).toBe('pytorch/pytorch');
  });

  it('accepts HTTPS URL with .git suffix', () => {
    expect(parseRepo('https://github.com/pytorch/pytorch.git')).toBe('pytorch/pytorch');
  });

  it('accepts SSH URL git@github.com', () => {
    expect(parseRepo('git@github.com:pytorch/pytorch.git')).toBe('pytorch/pytorch');
  });

  it('accepts org-prefixed SSH URL', () => {
    expect(parseRepo('org-21003710@github.com:pytorch/pytorch.git')).toBe('pytorch/pytorch');
  });

  it('strips trailing path segments after owner/repo', () => {
    expect(parseRepo('https://github.com/pytorch/pytorch/issues/1234')).toBe('pytorch/pytorch');
  });

  it('strips query strings', () => {
    expect(parseRepo('https://github.com/pytorch/pytorch?tab=issues')).toBe('pytorch/pytorch');
  });

  it('strips fragments', () => {
    expect(parseRepo('https://github.com/pytorch/pytorch#readme')).toBe('pytorch/pytorch');
  });

  it('returns null for empty string', () => {
    expect(parseRepo('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(parseRepo('   ')).toBeNull();
  });

  it('returns null for non-GitHub URL', () => {
    expect(parseRepo('https://gitlab.com/pytorch/pytorch')).toBeNull();
  });

  it('returns null for plain word', () => {
    expect(parseRepo('notarepo')).toBeNull();
  });

  it('handles slugs with dots and dashes', () => {
    expect(parseRepo('astral-sh/uv')).toBe('astral-sh/uv');
  });
});
