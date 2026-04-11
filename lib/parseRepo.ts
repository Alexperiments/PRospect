/**
 * Normalizes various GitHub repo input formats to "owner/repo".
 * Returns null if the input cannot be parsed.
 *
 * Accepted formats:
 *   - Bare slug:       pytorch/pytorch
 *   - HTTPS URL:       https://github.com/pytorch/pytorch[.git]
 *   - SSH URL:         git@github.com:pytorch/pytorch.git
 *   - Org SSH:         org-21003710@github.com:pytorch/pytorch.git
 *   - URLs with paths/query/fragment: stripped to owner/repo
 */
export function parseRepo(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Strip .git suffix before matching
  const stripped = trimmed.replace(/\.git$/, '');

  // Match github.com/{owner}/{repo} or github.com:{owner}/{repo}
  const match = stripped.match(
    /github\.com[:/]([a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+)/,
  );
  if (match && match[1]) {
    // Take only the first two segments (owner/repo), discard trailing path
    const parts = match[1].split('/');
    if (parts[0] && parts[1]) {
      return `${parts[0]}/${parts[1]}`;
    }
  }

  // Check if already a bare owner/repo slug
  if (/^[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}
