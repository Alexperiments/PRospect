import type { Env, GitHubIssue, GitHubPR, RankedIssue, AnalyzeResponse } from './types';
import { filterAvailableIssues } from './filterIssues';

const GITHUB_API = 'https://api.github.com';

export class RateLimitError extends Error {
  constructor() {
    super('GitHub rate limit hit. Wait a minute and try again.');
    this.name = 'RateLimitError';
  }
}

async function fetchGitHubJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'PRospect/1.0',
      Accept: 'application/vnd.github+json',
    },
  });
  if (res.status === 403 || res.status === 429) {
    throw new RateLimitError();
  }
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${url}`);
  }
  return res.json() as Promise<T>;
}

interface RepoData {
  issues: GitHubIssue[];
  prs: GitHubPR[];
  readme: string;
  contributing: string;
}

async function fetchRepoData(owner: string, repo: string): Promise<RepoData> {
  const base = `${GITHUB_API}/repos/${owner}/${repo}`;

  // Issues, PRs, and README fetched in parallel
  const [issuesRaw, prs, readmeData] = await Promise.all([
    fetchGitHubJSON<GitHubIssue[]>(`${base}/issues?state=open&per_page=100`),
    fetchGitHubJSON<GitHubPR[]>(`${base}/pulls?state=open&per_page=100`),
    fetchGitHubJSON<{ content: string }>(`${base}/readme`).catch(() => ({ content: '' })),
  ]);

  // GitHub's /issues endpoint also returns PRs — strip them out
  const issues = issuesRaw.filter((i) => !i.pull_request);

  const readme = readmeData.content
    ? atob(readmeData.content.replace(/\n/g, ''))
    : '';

  // Try root CONTRIBUTING.md, fall back to docs/CONTRIBUTING.md
  let contributing = '';
  try {
    const data = await fetchGitHubJSON<{ content: string }>(
      `${base}/contents/CONTRIBUTING.md`,
    );
    contributing = atob(data.content.replace(/\n/g, ''));
  } catch {
    try {
      const data = await fetchGitHubJSON<{ content: string }>(
        `${base}/contents/docs/CONTRIBUTING.md`,
      );
      contributing = atob(data.content.replace(/\n/g, ''));
    } catch {
      // No CONTRIBUTING.md found — proceed without it
    }
  }

  return { issues, prs, readme, contributing };
}

interface AnthropicRankedItem {
  number: number;
  difficulty: 'easy' | 'medium' | 'hard';
  reason: string;
  tags: string[];
}

async function rankIssues(
  availableIssues: GitHubIssue[],
  readme: string,
  contributing: string,
  apiKey: string,
): Promise<AnthropicRankedItem[]> {
  // Send the 40 most recent available issues
  const top40 = availableIssues.slice(0, 40);

  const issueList = top40
    .map((i) => `#${i.number}: ${i.title}\n${i.body?.slice(0, 500) ?? '(no body)'}`)
    .join('\n\n---\n\n');

  const prompt = `You are helping open-source contributors find approachable issues to work on. Given the following GitHub issues, rank the top 12 by how contributor-friendly they are for an outside contributor.

README (first 1500 chars):
${readme.slice(0, 1500)}

CONTRIBUTING (first 1000 chars):
${contributing.slice(0, 1000)}

ISSUES:
${issueList}

Return a JSON array of exactly 12 items (or fewer if there are fewer issues), ranked from most to least approachable for a first-time contributor. Each item must follow this exact shape:
{
  "number": <issue number as integer>,
  "difficulty": "easy" | "medium" | "hard",
  "reason": "<1-2 sentences: why this is a good issue to work on and why you assigned this difficulty>",
  "tags": [<one or more of: "bug", "feature", "docs", "test", "refactor", "dx", "perf", "security">]
}

Return the raw JSON array only. No markdown fences, no prose, no explanation before or after the array.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  let text = data.content[0]?.text ?? '';

  // Strip accidental markdown fences
  text = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();

  return JSON.parse(text) as AnthropicRankedItem[];
}

export async function analyzeRepo(
  repo: string,
  env: Env,
): Promise<AnalyzeResponse> {
  const [owner, name] = repo.split('/') as [string, string];

  const { issues, prs, readme, contributing } = await fetchRepoData(owner, name);

  const available = filterAvailableIssues(issues, prs);

  const ranked = await rankIssues(available, readme, contributing, env.ANTHROPIC_API_KEY);

  // Build a lookup map for enriching ranked items with GitHub data
  const issueMap = new Map(issues.map((i) => [i.number, i]));

  const enriched: RankedIssue[] = ranked
    .map((r) => {
      const issue = issueMap.get(r.number);
      if (!issue) return null;
      return {
        number: r.number,
        title: issue.title,
        comments: issue.comments,
        html_url: issue.html_url,
        difficulty: r.difficulty,
        reason: r.reason,
        tags: r.tags,
      } satisfies RankedIssue;
    })
    .filter((r): r is RankedIssue => r !== null);

  return {
    stats: {
      openIssues: issues.length,
      available: available.length,
      openPRs: prs.length,
      ranked: enriched.length,
    },
    issues: enriched,
  };
}
