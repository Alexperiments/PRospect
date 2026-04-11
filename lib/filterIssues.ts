import type { GitHubIssue } from './types';

/**
 * Returns issues that have no assignees.
 * Cross-reference filtering (linked open PRs) is handled separately via the
 * GitHub timeline API in analyzer.ts.
 */
export function filterUnassignedIssues(issues: GitHubIssue[]): GitHubIssue[] {
  return issues.filter((issue) => issue.assignees.length === 0);
}
