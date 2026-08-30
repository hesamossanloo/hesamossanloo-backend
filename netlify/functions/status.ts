import type { Config, Context } from "@netlify/functions";
import { authenticate, otherPair } from "./_shared/auth";
import { json, options, readJson } from "./_shared/http";
import { compareActivities } from "./_shared/compare";
import { getActivity } from "./_shared/store";
import type { PairSummary } from "./_shared/types";

type StatusRequest = {
  sessionId: string;
  accessCode: string;
};

function summary(pair: PairSummary["pair"], submitted: boolean, activity?: Awaited<ReturnType<typeof getActivity>>): PairSummary {
  if (!submitted || !activity) return { pair, submitted: false };
  return {
    pair,
    submitted: true,
    city: activity.city,
    date: activity.date,
    timeWindow: activity.timeWindow,
    category: activity.category,
    indoorOutdoor: activity.indoorOutdoor,
    foodInvolved: activity.foodInvolved,
    intensity: activity.intensity,
    updatedAt: activity.updatedAt,
  };
}

function privateSummary(pair: PairSummary["pair"], submitted: boolean): PairSummary {
  return { pair, submitted };
}

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await readJson<StatusRequest>(req);
    const auth = await authenticate(body.sessionId, body.accessCode);
    const other = otherPair(auth.pair);
    const ownActivity = await getActivity(auth.sessionId, auth.pair);
    const otherActivity = await getActivity(auth.sessionId, other);
    const conflict = await compareActivities(ownActivity, otherActivity);

    return json({
      pair: auth.pair,
      own: summary(auth.pair, Boolean(ownActivity), ownActivity),
      other: privateSummary(other, Boolean(otherActivity)),
      conflict: {
        level: conflict.level,
        publicMessage:
          conflict.level === "waiting"
            ? "Waiting for both couples to submit an activity."
            : "I checked the private plans without revealing the other side's details.",
        reasons: [],
        suggestions: [],
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 });
  }
};

export const config: Config = {
  path: "/api/status",
  method: ["POST", "OPTIONS"],
};
