export interface Env {
  ANTHROPIC_API_KEY: string;
  ASSETS: Fetcher;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  assignees: { login: string }[];
  pull_request?: { url: string };
  comments: number;
  html_url: string;
  created_at: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
}

export interface RankedIssue {
  number: number;
  title: string;
  comments: number;
  html_url: string;
  difficulty: 'easy' | 'medium' | 'hard';
  reason: string;
  tags: string[];
}

export interface AnalyzeResponse {
  stats: {
    openIssues: number;
    available: number;
    openPRs: number;
    ranked: number;
  };
  issues: RankedIssue[];
}
