# Secret Keeper Chatbot Handoff

## Repositories

- Frontend/portfolio: `git@github.com:hesamossanloo/hesamossanloo.github.io.git`
- Backend/API: `git@github.com:hesamossanloo/hesamossanloo-backend.git`

## Deployed Services

- Portfolio: `https://hesam.info`
- Secret Keeper page: `https://hesam.info/secret-keeper/`
- Backend API Netlify site: `https://secret-keeper-service.netlify.app`

## Current Backend State

The backend is a small Netlify Functions app with static assets in `public/`.

Implemented endpoints:

- `POST /api/status`
- `POST /api/activity`
- `POST /api/chat`

Shared code:

- `netlify/functions/_shared/auth.ts`
- `netlify/functions/_shared/store.ts`
- `netlify/functions/_shared/compare.ts`
- `netlify/functions/_shared/http.ts`

Persistence currently uses Netlify Blobs:

```text
sessions/{sessionId}/activities/hj.json
sessions/{sessionId}/activities/cm.json
sessions/{sessionId}/chats/hj.json
sessions/{sessionId}/chats/cm.json
```

Current pair ids:

- `hj`: Hesam/Jana
- `cm`: Christian/Meike

## Current Env Vars

Runtime env vars for Netlify:

```text
OPENAI_API_KEY
OPENAI_MODEL
SECRET_KEEPER_SESSION
SECRET_KEEPER_HJ_CODE
SECRET_KEEPER_CM_CODE
```

Netlify is connected directly to the GitHub repo and handles CI/CD. There is no
GitHub Actions deployment workflow in the repo.

Local `.env` exists and is ignored by git.

## Current User Journey

1. User opens `https://hesam.info/secret-keeper/`.
2. Static chat page loads from the portfolio site.
3. User provides the shared session name and their couple code.
4. Frontend calls the Netlify backend API.
5. Backend authenticates the code into one of two fixed pair ids.
6. Backend reads stored activity/chat data from Netlify Blobs.
7. Backend calls OpenAI if `OPENAI_API_KEY` is configured.
8. Backend returns a safe response that must not reveal the other couple's exact secret.

## Important Caveat

The current implementation is not yet the final dynamic "agent creates sessions and access codes" design. It uses preconfigured env vars for a single fixed session and two fixed pair codes.

This means whoever configures both pair codes can know both codes. That is acceptable only for a trusted admin/bootstrap model, not for mutual secrecy between Hesam and Christian.

## Recommended Next Architecture

Replace the fixed env-var session/couple model with DB-backed dynamic entities:

```text
sessions/index.json
sessions/{sessionId}/session.json
sessions/{sessionId}/participants/{participantId}.json
sessions/{sessionId}/secrets/{participantId}.json
sessions/{sessionId}/chats/{participantId}.json
```

Add an agent endpoint:

```text
POST /api/assistant
```

Server-side tools/functions the agent should be allowed to call:

```text
create_session
find_related_sessions
join_session
create_participant
create_participant_code
save_secret
get_safe_counterparty_summary
compare_secrets
```

The browser should never call OpenAI directly and should never access Netlify Blobs directly.

## Better Secrecy Model

For the Japan surprise use case, use invite links or generated participant codes:

- Hesam/Jana create a session and receive their private link/code.
- The app generates a separate invite link/code for Christian/Meike.
- Hesam/Jana can send that invite without seeing the raw stored secret later.
- Christian/Meike can set or rotate their own private access code after first entry.

If Hesam must not be able to access Christian/Meike's plan, do not make Hesam manually choose `SECRET_KEEPER_CM_CODE`.

## Known Issues / Next Steps

- Implement full conversational onboarding.
- Let the agent create sessions dynamically.
- Let participants create or rotate their own codes.
- Store participants and secrets in Blobs instead of fixed env vars.
- Add structured extraction from chat messages into secret/activity records.
- Add stricter secret-leak tests around comparison responses.
- Consider Netlify DB or Supabase only if the app grows beyond a few users/sessions.

## Useful Commands

Backend:

```bash
cd /Users/hesam.ossanloo/Projects/hesamossanloo-backend
git status
git push
```

Manual backend deploy:

```bash
PATH=/Users/hesam.ossanloo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/tsc --noEmit
PATH=/Users/hesam.ossanloo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node scripts/build.mjs
PATH=/Users/hesam.ossanloo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/netlify deploy --prod --no-build --dir=dist --functions=netlify/functions
```

Frontend:

```bash
cd /Users/hesam.ossanloo/Projects/hesamossanloo.github.io
git status
git push
```
