import type { Config, Context } from "@netlify/functions";
import { hasChangedAccessCode } from "./_shared/auth";
import { json, options, readJson } from "./_shared/http";
import type { PairId } from "./_shared/types";

type CodeStatusRequest = {
  sessionId?: string;
  pair: PairId;
};

function coupleLabel(pair: PairId) {
  return pair === "hj" ? "Hesam and Jana" : "Christian and Meike";
}

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await readJson<CodeStatusRequest>(req);
    if (!["hj", "cm"].includes(body.pair)) {
      return json({ error: "Unknown person." }, { status: 400 });
    }

    const changed = await hasChangedAccessCode(body.sessionId, body.pair);
    return json({
      pair: body.pair,
      coupleLabel: coupleLabel(body.pair),
      changed,
      prompt: changed
        ? `Ok ${coupleLabel(body.pair)}, please enter the new code you chose yourself.`
        : `Ok ${coupleLabel(body.pair)}, please enter the code Hesam has given you like this: code: your-code`,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 });
  }
};

export const config: Config = {
  path: "/api/code-status",
  method: ["POST", "OPTIONS"],
};
