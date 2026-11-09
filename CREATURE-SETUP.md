# Creature Tags: Setup & Test Guide

This turns the MVP done-conditions in [`seed/00-context.md`](./seed/00-context.md) into something three adults can actually use: tap a tag, claim a creature, talk to it, and keep only the memories they approve.

## What's built

| Done-condition | Status after this build |
| --- | --- |
| #1 Physical creature linked by QR/NFC | **Software ready.** `/c/<id>` tag page, printed claim code, QR cards from `scripts/mint_creatures.py`. Still needs a printed shell with the sticker or card. |
| #2 Persistent AI personality + conversation | **Built.** Chat at `/c/<id>` once claimed. Uses Claude (or any OpenAI-compatible model, including local Ollama). Offline scripted mode if no key. |
| #3 Seven-day memory across restarts | **Built, needs Supabase.** Only APPROVED memories are sent to the model across days. Tested against real Postgres. |
| #4 Browser workspace | **Built.** Conversation, memory ledger (keep / edit / not this / forget), pairing record. |
| #5 Ownership record | **Built.** Supabase email sign-in, claim code, owner-only access, identity export. |
| #6 Royalty demo | Already existed (`/workspace`, simulated ledger). |
| #7 Three consenting adults | **Not started.** Protocol below. |

### The consent rule, enforced in code

The model never writes memory. It can only end a reply with a `<propose_memory>` line; the server files that as `PROPOSED` and the owner decides. No code path from model output reaches `review_memory`. Conversation older than about 3 hours is not sent back to the model, so anything that carries across days went through the owner's approval. See `apps/creatures/chat.py` and `tests/test_creature_app.py`.

## One-time setup (about 30 minutes)

### 1. Supabase project (storage + sign-in)
1. Create a free project at supabase.com.
2. **Database URL:** click **Connect** at the top of the project, choose the **Transaction pooler** (port 6543), copy the string, and put your database password in it. This becomes `DATABASE_URL`.
3. **Keys:** Settings → API Keys. Copy the project URL and the **publishable** key (older projects call it the `anon` key). These become `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Never use the secret / service-role key here.
4. **Sign-in redirects:** Authentication → URL Configuration. Set Site URL to your Vercel address and add `https://<your-vercel-domain>/c/*` to Redirect URLs.
5. Optional but helpful on phones: Authentication → Email Templates → Magic Link, add `{{ .Token }}` to the email so testers can type a code if the link opens in a different browser.

You don't need to create tables. The app creates them on first request and switches on row level security, which blocks Supabase's public REST API from reading them. The app reads and writes only through `DATABASE_URL`.

### 2. Model key
Get an API key from platform.claude.com. The default model is `claude-haiku-5-5` (fast, cheap); set `LLM_MODEL=claude-sonnet-5-5` for richer replies.

### 3. Vercel environment variables
Project → Settings → Environment Variables, then redeploy:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler string |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_ANON_KEY` | publishable / anon key |
| `ANTHROPIC_API_KEY` | your Claude API key |
| `LLM_MODEL` | optional |

Without `DATABASE_URL` the page shows a red "storage is temporary" warning, because Vercel wipes its disk. Don't run the 7-day test until that warning is gone.

### 4. Mint creatures and print tags
On your laptop, with the same `DATABASE_URL`:

```bash
pip install "psycopg[binary]" segno
DATABASE_URL="postgresql://..." python3 scripts/mint_creatures.py \
  --base-url https://robotic-discipline-portal-school.vercel.app
```

This registers PATCH, MOSS, and PIP from `creatures/founding.json` and writes `tag-output/cards.html` (QR + claim code per creature) and `tag-output/tags.csv`. That folder is git-ignored because it holds claim codes. Print the cards. Each code works once.

**NFC:** write the same tag URL to an NTAG213/215 sticker as a URL record with a free NFC writer app, and recess it in the shell's 28 mm base cavity.

Lost a code before handoff? `--only mk-patch-001 --reissue` prints a new one and voids the old one. Claimed creatures can't be reissued.

## Local development

```bash
python3 scripts/dev_server.py          # http://localhost:3000/c/mk-demo-patch
```

With no Supabase variables and outside Vercel, the page uses a local "pick a name" sign-in and seeds a demo PATCH with claim code `DEMO-DEMO-DEMO`. Neither can turn on in a Vercel deployment. Add `ANTHROPIC_API_KEY`, or `OPENAI_COMPATIBLE_BASE_URL=http://localhost:11434/v1` and `LLM_MODEL=llama3.1` for Ollama, to talk to a real model.

Tests: `python3 -m unittest discover -s tests`. To run the creature tests against Postgres too, point `TEST_DATABASE_URL` at a throwaway database (tables get truncated; never use the real one).

## Done-condition #7: three-adult test protocol

For each consenting adult (18+), on their own phone:

1. **Day 1 — activation.** Hand them the shell and card. They scan or tap, sign in with their email, and enter the claim code. Note the time, and anything that confused them.
2. **Day 1 — conversation.** They talk for about 10 minutes about something real they're working on. They decide which proposed memories to keep. Target: at least 3 kept.
3. **Day 8 — return.** They come back on their own, tap the tag, and ask what it remembers. Pass if it recalls at least 3 kept details correctly and nothing they rejected.
4. Export the identity file with them, and ask the five Mom Test questions in [`seed/03-customers-100.md`](./seed/03-customers-100.md).

Record results honestly in `seed/00-context.md` (`metrics_we_have`). Three passes or a clear reason it failed are both useful.

## Not built yet (on purpose)

Dify, Open WebUI, n8n, Crawl4AI, wallets, and any on-chain work wait until three adults pass the recall test. NFC tags hold a plain URL; signed NTAG424 tags are a later step.
