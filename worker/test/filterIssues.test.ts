import { describe, it, expect } from 'vitest';
import { filterAvailableIssues } from '../src/filterIssues';
import type { GitHubIssue, GitHubPR } from '../src/types';

function makeIssue(overrides: Partial<GitHubIssue> & { number: number }): GitHubIssue {
  return {
    title: `Issue ${overrides.number}`,
    body: null,
    assignees: [],
    comments: 0,
    html_url: `https://github.com/owner/repo/issues/${overrides.number}`,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePR(overrides: Partial<GitHubPR> & { number: number }): GitHubPR {
  return {
    title: `PR ${overrides.number}`,
    body: null,
    ...overrides,
  };
}

describe('filterAvailableIssues', () => {
  it('returns all issues when no PRs exist and no assignees', () => {
    const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
    expect(filterAvailableIssues(issues, [])).toHaveLength(2);
  });

  it('excludes issues with at least one assignee', () => {
    const issues = [
      makeIssue({ number: 1, assignees: [{ login: 'alice' }] }),
      makeIssue({ number: 2 }),
    ];
    const result = filterAvailableIssues(issues, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.number).toBe(2);
  });

  it('excludes issues referenced by #NNN in a PR title', () => {
    const issues = [makeIssue({ number: 42 }), makeIssue({ number: 99 })];
    const prs = [makePR({ number: 100, title: 'Fix #42' })];
    const result = filterAvailableIssues(issues, prs);
    expect(result).toHaveLength(1);
    expect(result[0]!.number).toBe(99);
  });

  it('excludes issues referenced by #NNN in a PR body', () => {
    const issues = [makeIssue({ number: 42 }), makeIssue({ number: 99 })];
    const prs = [makePR({ number: 100, body: 'Closes #42 and fixes stuff' })];
    const result = filterAvailableIssues(issues, prs);
    expect(result).toHaveLength(1);
    expect(result[0]!.number).toBe(99);
  });

  it('handles PRs with null body without throwing', () => {
    const issues = [makeIssue({ number: 1 })];
    const prs = [makePR({ number: 2, body: null })];
    expect(() => filterAvailableIssues(issues, prs)).not.toThrow();
    expect(filterAvailableIssues(issues, prs)).toHaveLength(1);
  });

  it('excludes issues that are both assigned and referenced', () => {
    const issues = [makeIssue({ number: 5, assignees: [{ login: 'bob' }] })];
    const prs = [makePR({ number: 6, title: 'Fix #5' })];
    expect(filterAvailableIssues(issues, prs)).toHaveLength(0);
  });

  it('handles a PR referencing multiple issues', () => {
    const issues = [
      makeIssue({ number: 10 }),
      makeIssue({ number: 20 }),
      makeIssue({ number: 30 }),
    ];
    const prs = [makePR({ number: 99, body: 'Fixes #10 and #20' })];
    const result = filterAvailableIssues(issues, prs);
    expect(result).toHaveLength(1);
    expect(result[0]!.number).toBe(30);
  });

  it('returns empty array when all issues are filtered', () => {
    const issues = [makeIssue({ number: 1, assignees: [{ login: 'x' }] })];
    expect(filterAvailableIssues(issues, [])).toHaveLength(0);
  });
});
