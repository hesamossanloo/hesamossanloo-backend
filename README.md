# Secret Keeper Chatbot

Small Netlify app for coordinating secrets between two parties without revealing the sensitive details to the other side. The first use case is the Japan 2026 surprise activity exchange between Hesam/Jana and Christian/Meike.

## Free Architecture

- Static frontend in `public/`
- Netlify Functions in `netlify/functions/`
- Netlify Blobs as the free persistence layer
- OpenAI API key stored only as a Netlify environment variable

## Required Environment Variables

Set these in Netlify:

```bash
OPENAI_API_KEY=paste-your-openai-api-key-here
SECRET_KEEPER_SESSION=japan-2026
SECRET_KEEPER_HJ_CODE=private-code-for-hesam-jana
SECRET_KEEPER_CM_CODE=private-code-for-christian-meike
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_MODEL` is optional. The app defaults to `gpt-4.1-mini`. Placeholder OpenAI keys are treated as not configured, so the app will keep working with deterministic checks until you paste the real key in Netlify.

## CI/CD

The repository includes a GitHub Actions workflow that builds and deploys to Netlify on every push to `main` or `master`.

Set these GitHub repository settings after creating the remote repo:

```bash
NETLIFY_SITE_ID=7ba32ff3-933b-4af6-af9f-d5793a533b04
NETLIFY_AUTH_TOKEN=your-netlify-personal-access-token
```

Use `NETLIFY_SITE_ID` as a repository variable if you prefer. Keep `NETLIFY_AUTH_TOKEN` as a repository secret.

## Local Dev

```bash
npm install
npm run dev
```

Use `netlify dev` so Netlify Blobs and Functions behave like production.
