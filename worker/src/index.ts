import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
import type { Env } from './types';
import { parseRepo } from './parseRepo';
import { analyzeRepo, RateLimitError } from './analyzer';

const assetManifest = JSON.parse(manifestJSON) as Record<string, string>;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Serve static frontend
    if (url.pathname === '/' && request.method === 'GET') {
      try {
        return await getAssetFromKV(
          { request, waitUntil: ctx.waitUntil.bind(ctx) },
          {
            ASSET_NAMESPACE: env.__STATIC_CONTENT,
            ASSET_MANIFEST: assetManifest,
          },
        );
      } catch {
        return new Response('Not found', { status: 404 });
      }
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

    // 404 for everything else
    return new Response('Not found', { status: 404 });
  },
};
