import type { Env } from './types';
import { parseRepo } from './parseRepo';
import { analyzeRepo, RateLimitError } from './analyzer';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Analysis endpoint
    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      let body: { repo?: unknown };
      try {
        body = (await request.json()) as { repo?: unknown };
      } catch {
        return Response.json(
          { error: 'Invalid JSON body' },
          { status: 400, headers: CORS_HEADERS },
        );
      }

      if (typeof body.repo !== 'string') {
        return Response.json(
          { error: 'Invalid repo format' },
          { status: 400, headers: CORS_HEADERS },
        );
      }

      const repo = parseRepo(body.repo);
      if (!repo) {
        return Response.json(
          { error: 'Invalid repo format' },
          { status: 400, headers: CORS_HEADERS },
        );
      }

      try {
        const result = await analyzeRepo(repo, env);
        return Response.json(result, { headers: CORS_HEADERS });
      } catch (err) {
        if (err instanceof RateLimitError) {
          return Response.json(
            { error: 'GitHub rate limit hit. Wait a minute and try again.' },
            { status: 429, headers: CORS_HEADERS },
          );
        }
        if (err instanceof SyntaxError) {
          return Response.json(
            { error: 'Failed to parse AI response.' },
            { status: 500, headers: CORS_HEADERS },
          );
        }
        console.error('analyzeRepo error:', err);
        return Response.json(
          { error: 'Internal server error.' },
          { status: 500, headers: CORS_HEADERS },
        );
      }
    }

    // All other requests (GET /, static assets, 404s) handled by the assets binding
    return env.ASSETS.fetch(request);
  },
};
