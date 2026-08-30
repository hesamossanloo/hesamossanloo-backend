import OpenAI from "openai";
import type { Activity, ConflictResult } from "./types";

function deterministicCompare(a: Activity | null, b: Activity | null): ConflictResult {
  if (!a || !b) {
    return {
      level: "waiting",
      publicMessage: "Waiting for both couples to submit an activity.",
      reasons: [],
      suggestions: ["Submit your activity details privately, then check again."],
    };
  }

  const sameCity = a.city.trim().toLowerCase() === b.city.trim().toLowerCase();
  const sameDate = a.date.trim().toLowerCase() === b.date.trim().toLowerCase();
  const sameCategory = a.category.trim().toLowerCase() === b.category.trim().toLowerCase();
  const sameWindow = a.timeWindow.trim().toLowerCase() === b.timeWindow.trim().toLowerCase();

  if (sameCity && sameDate && sameCategory) {
    return {
      level: "conflict",
      publicMessage: "Conflict: both plans are too close. One couple should choose a different activity.",
      reasons: ["Same city, same date, and same broad category."],
      suggestions: ["Change the date, city, or category to protect the surprise."],
    };
  }

  if ((sameCity && sameCategory) || (sameDate && sameCategory) || (sameCity && sameDate && sameWindow)) {
    return {
      level: "possible",
      publicMessage: "Possible conflict: the plans overlap enough that one couple should adjust.",
      reasons: ["Some metadata overlaps, but the exact other activity remains hidden."],
      suggestions: ["Move to another time window or choose a different category."],
    };
  }

  return {
    level: "none",
    publicMessage: "No conflict found. The surprise plans look distinct.",
    reasons: ["The visible metadata does not suggest the same activity."],
    suggestions: ["You can proceed, assuming the hidden venue details are not intentionally identical."],
  };
}

function getOpenAIKey() {
  const key = Netlify.env.get("OPENAI_API_KEY")?.trim();
  if (!key || key === "paste-your-openai-api-key-here" || key === "replace-me") return null;
  return key;
}

export async function compareActivities(
  own: Activity | null,
  other: Activity | null,
): Promise<ConflictResult> {
  const apiKey = getOpenAIKey();
  if (!own || !other || !apiKey) {
    return deterministicCompare(own, other);
  }

  const fallback = deterministicCompare(own, other);
  const openai = new OpenAI({ apiKey });
  const model = Netlify.env.get("OPENAI_MODEL");
  if (!model) return fallback;

  try {
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You compare two surprise activities. Never reveal either exact title, venue, address, link, or identifying secret details. Return only JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction:
              "Decide if these two surprise activities conflict. Use hidden titles only for comparison; do not reveal them. Keep publicMessage safe for both couples.",
            allowedLevels: ["none", "possible", "conflict"],
            activityA: own,
            activityB: other,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "conflict_result",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              level: { type: "string", enum: ["none", "possible", "conflict"] },
              publicMessage: { type: "string" },
              reasons: { type: "array", items: { type: "string" } },
              suggestions: { type: "array", items: { type: "string" } },
            },
            required: ["level", "publicMessage", "reasons", "suggestions"],
          },
        },
      },
    });

    const parsed = JSON.parse(response.output_text) as ConflictResult;
    return {
      level: parsed.level,
      publicMessage: parsed.publicMessage,
      reasons: parsed.reasons.slice(0, 3),
      suggestions: parsed.suggestions.slice(0, 3),
    };
  } catch {
    return fallback;
  }
}
