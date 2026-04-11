import Anthropic from '@anthropic-ai/sdk';
import type { GitHubIssue, RankedIssue, AnalyzeResponse } from './types';

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
      'User-Agent': 'git-prospect/1.0',
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

interface SearchResult {
  total_count: number;
  items: GitHubIssue[];
}

async function searchAvailableIssues(owner: string, repo: string): Promise<SearchResult> {
  const q = encodeURIComponent(`is:issue state:open no:assignee -linked:pr repo:${owner}/${repo}`);
  return fetchGitHubJSON<SearchResult>(`${GITHUB_API}/search/issues?q=${q}&per_page=100`);
}

async function fetchRepoContext(owner: string, repo: string): Promise<{ readme: string; contributing: string }> {
  const base = `${GITHUB_API}/repos/${owner}/${repo}`;

  const readmeData = await fetchGitHubJSON<{ content: string }>(`${base}/readme`).catch(() => ({ content: '' }));
  const readme = readmeData.content ? atob(readmeData.content.replace(/\n/g, '')) : '';

  let contributing = '';
  try {
    const data = await fetchGitHubJSON<{ content: string }>(`${base}/contents/CONTRIBUTING.md`);
    contributing = atob(data.content.replace(/\n/g, ''));
  } catch {
    try {
      const data = await fetchGitHubJSON<{ content: string }>(`${base}/contents/docs/CONTRIBUTING.md`);
      contributing = atob(data.content.replace(/\n/g, ''));
    } catch {
      // No CONTRIBUTING.md found — proceed without it
    }
  }

  return { readme, contributing };
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

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const { input_tokens, output_tokens } = response.usage;
  const content = response.content[0];
  if (content?.type !== 'text') throw new Error('Unexpected Anthropic response type');

  console.log(JSON.stringify({
    model: response.model,
    input_tokens,
    output_tokens,
    prompt,
    response: content.text,
  }));

  const text = content.text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();

  return JSON.parse(text) as AnthropicRankedItem[];
}

export async function analyzeRepo(
  repo: string,
  apiKey: string,
): Promise<AnalyzeResponse> {
  const [owner, name] = repo.split('/') as [string, string];

  const [{ total_count, items: available }, { readme, contributing }] = await Promise.all([
    searchAvailableIssues(owner, name),
    fetchRepoContext(owner, name),
  ]);

  const ranked = await rankIssues(available, readme, contributing, apiKey);

  const issueMap = new Map(available.map((i) => [i.number, i]));

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
      available: total_count,
      ranked: enriched.length,
    },
    issues: enriched,
  };
}
