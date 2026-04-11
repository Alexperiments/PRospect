import * as logfire from '@pydantic/logfire-node';
import { parseRepo } from '../lib/parseRepo';
import { analyzeRepo, RateLimitError } from '../lib/analyzer';

let logfireConfigured = false;
function ensureLogfire() {
  if (!logfireConfigured) {
    logfire.configure({ serviceName: 'prospect' });
    logfireConfigured = true;
  }
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(request: Request): Promise<Response> {
  ensureLogfire();

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS_HEADERS });
  }

  let body: { repo?: unknown };
  try {
    body = (await request.json()) as { repo?: unknown };
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS });
  }

  if (typeof body.repo !== 'string') {
    return Response.json({ error: 'Invalid repo format' }, { status: 400, headers: CORS_HEADERS });
  }

  const repo = parseRepo(body.repo);
  if (!repo) {
    return Response.json({ error: 'Invalid repo format' }, { status: 400, headers: CORS_HEADERS });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';

  try {
    const result = await analyzeRepo(repo, apiKey);
    return Response.json(result, { headers: CORS_HEADERS });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return Response.json(
        { error: 'GitHub rate limit hit. Wait a minute and try again.' },
        { status: 429, headers: CORS_HEADERS },
      );
    }
    if (err instanceof SyntaxError) {
      return Response.json({ error: 'Failed to parse AI response.' }, { status: 500, headers: CORS_HEADERS });
    }
    console.error('analyzeRepo error:', err);
    return Response.json({ error: 'Internal server error.' }, { status: 500, headers: CORS_HEADERS });
  }
}
