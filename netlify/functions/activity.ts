import type { Config, Context } from "@netlify/functions";
import { authenticate, otherPair } from "./_shared/auth";
import { compareActivities } from "./_shared/compare";
import { json, options, readJson } from "./_shared/http";
import { getActivity, saveActivity } from "./_shared/store";
import type { Activity } from "./_shared/types";

type ActivityRequest = {
  sessionId: string;
  accessCode: string;
  activity: {
    title: string;
    city: string;
    date: string;
    timeWindow: string;
    category: string;
    indoorOutdoor: string;
    foodInvolved: string;
    intensity: string;
    notes?: string;
  };
};

function clean(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await readJson<ActivityRequest>(req);
    const auth = await authenticate(body.sessionId, body.accessCode);
    const input = body.activity;

    const required = [
      input.title,
      input.city,
      input.date,
      input.timeWindow,
      input.category,
      input.indoorOutdoor,
      input.foodInvolved,
      input.intensity,
    ];
    if (required.some((value) => !value || !value.trim())) {
      return json({ error: "Please fill every required field." }, { status: 400 });
    }

    const activity: Activity = {
      pair: auth.pair,
      sessionId: auth.sessionId,
      title: clean(input.title, 160),
      city: clean(input.city, 80),
      date: clean(input.date, 80),
      timeWindow: clean(input.timeWindow, 80),
      category: clean(input.category, 80),
      indoorOutdoor: clean(input.indoorOutdoor, 80),
      foodInvolved: clean(input.foodInvolved, 80),
      intensity: clean(input.intensity, 80),
      notes: clean(input.notes ?? "", 600),
      updatedAt: new Date().toISOString(),
    };

    await saveActivity(activity);
    const otherActivity = await getActivity(auth.sessionId, otherPair(auth.pair));
    const conflict = await compareActivities(activity, otherActivity);

    return json({
      saved: true,
      pair: auth.pair,
      conflict,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 });
  }
};

export const config: Config = {
  path: "/api/activity",
  method: ["POST", "OPTIONS"],
};
