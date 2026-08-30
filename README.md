# Secret Keeper Chatbot

Small Netlify app for coordinating secrets between two parties without revealing the sensitive details to the other side. The first use case is the Japan 2026 surprise activity exchange between Hesam/Jana and Christian/Meike.

## Free Architecture

- API-only Netlify site with a minimal non-chat landing page
- Netlify Functions in `netlify/functions/`
- Netlify Blobs as the free persistence layer
- OpenAI API key stored only as a Netlify environment variable

## Required Environment Variables

Set these in Netlify:

```bash
OPENAI_API_KEY=paste-your-openai-api-key-here
SECRET_KEEPER_SESSION=your-session-name
SECRET_KEEPER_HJ_CODE=private-code-for-hesam-jana
SECRET_KEEPER_CM_CODE=private-code-for-christian-meike
OPENAI_MODEL=your-openai-model
```

Placeholder OpenAI keys are treated as not configured, so the app will keep
working with deterministic checks until you paste the real key in Netlify.

## CI/CD

Netlify deploys this repo directly from GitHub. Do not configure a separate
GitHub Actions deploy workflow unless Netlify Git deploys are intentionally
disabled.

## Local Dev

```bash
npm install
npm run dev
```

Use `netlify dev` so Netlify Blobs and Functions behave like production.
