import type { Config, Context } from "@netlify/functions";
import { authenticate, otherPair } from "./_shared/auth";
import { json, options, readJson } from "./_shared/http";
import { compareActivities } from "./_shared/compare";
import { getActivities } from "./_shared/store";
import type { Activity, PairSummary } from "./_shared/types";

type StatusRequest = {
  sessionId: string;
  accessCode: string;
};

function summary(pair: PairSummary["pair"], activity: Activity | null): PairSummary {
  if (!activity) return { pair, submitted: false };
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
    const ownActivities = await getActivities(auth.sessionId, auth.pair);
    const otherActivities = await getActivities(auth.sessionId, other);
    const conflicts = {
      tokyo: await compareActivities(ownActivities.tokyo, otherActivities.tokyo),
      osaka: await compareActivities(ownActivities.osaka, otherActivities.osaka),
    };

    return json({
      pair: auth.pair,
      own: {
        tokyo: summary(auth.pair, ownActivities.tokyo),
        osaka: summary(auth.pair, ownActivities.osaka),
      },
      other: {
        tokyo: privateSummary(other, Boolean(otherActivities.tokyo)),
        osaka: privateSummary(other, Boolean(otherActivities.osaka)),
      },
      conflicts,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 });
  }
};

export const config: Config = {
  path: "/api/status",
  method: ["POST", "OPTIONS"],
};
