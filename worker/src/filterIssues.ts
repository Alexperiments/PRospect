import type { GitHubIssue, GitHubPR } from './types';

/**
 * Returns issues that:
 *   (a) have zero assignees, AND
 *   (b) whose number does not appear as #NNN in any open PR's title or body.
 */
export function filterAvailableIssues(
  issues: GitHubIssue[],
  prs: GitHubPR[],
): GitHubIssue[] {
  const referenced = new Set<number>();

  for (const pr of prs) {
    const text = `${pr.title ?? ''} ${pr.body ?? ''}`;
    for (const m of text.matchAll(/#(\d+)/g)) {
      const num = m[1];
      if (num !== undefined) referenced.add(Number(num));
    }
  }

  return issues.filter(
    (issue) => issue.assignees.length === 0 && !referenced.has(issue.number),
  );
}
