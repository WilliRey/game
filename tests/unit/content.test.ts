import { describe, expect, it } from 'vitest';
import { loadContent } from '@/content';
import { validateContent } from '@/content/validate';

describe('content', () => {
  const content = loadContent();

  it('loads every data file through its schema', () => {
    expect(content.lists.items.length).toBeGreaterThanOrEqual(50);
    expect(Object.keys(content.zones).length).toBeGreaterThanOrEqual(7);
  });

  it('passes cross-reference and completability validation', () => {
    const report = validateContent(content);
    expect(report.errors).toEqual([]);
  });
});
