# Japan Secret Keeper

Small Netlify app for coordinating surprise activities between two couples without revealing the activities.

## Free Architecture

- Static frontend in `public/`
- Netlify Functions in `netlify/functions/`
- Netlify Blobs as the free persistence layer
- OpenAI API key stored only as a Netlify environment variable

## Required Environment Variables

Set these in Netlify:

```bash
OPENAI_API_KEY=...
SECRET_KEEPER_SESSION=japan-2026
SECRET_KEEPER_HJ_CODE=private-code-for-hesam-jana
SECRET_KEEPER_CM_CODE=private-code-for-christian-meike
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_MODEL` is optional. The app defaults to `gpt-4.1-mini`.

## Local Dev

```bash
npm install
npm run dev
```

Use `netlify dev` so Netlify Blobs and Functions behave like production.
