# PRospect

Find approachable open-source issues to contribute to. Paste any GitHub repo URL or slug — PRospect fetches open issues, filters out ones already being worked on, then asks Claude to rank the rest by how contributor-friendly they are.

![PRospect screenshot](docs/screenshot.png)

## Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/your-username/PRospect.git
   cd PRospect
   ```

2. **Install dependencies**
   ```bash
   cd worker && npm install
   ```

3. **Log in to Cloudflare**
   ```bash
   npx wrangler login
   ```

4. **Set the Anthropic API key as a Worker secret**
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   ```
   Paste your key when prompted. It is never stored in any file.

5. **Add Cloudflare API token to GitHub repo secrets**

   In your GitHub repo → Settings → Secrets and variables → Actions, add:
   - `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with **Workers Scripts: Edit** permission

6. **Push to main — GitHub Actions deploys automatically**
   ```bash
   git push origin main
   ```

7. **Your app is live at**
   ```
   https://prospect.<your-subdomain>.workers.dev
   ```

## Local development

```bash
cd worker && npx wrangler dev
```

Open [http://localhost:8787](http://localhost:8787).

## Running tests

```bash
cd worker && npm test
```

## How it works

1. User pastes a GitHub repo URL, slug, or SSH remote — the frontend normalizes it to `owner/repo`
2. The Worker fetches open issues, open PRs, README, and CONTRIBUTING.md in parallel from the GitHub API
3. Issues that have assignees or are referenced in any open PR's title/body are filtered out
4. The top 40 remaining issues (plus repo context) are sent to `claude-sonnet-4-5` to rank and label by difficulty
5. Results are returned as a ranked card list with Easy / Medium / Hard badges and tag labels
