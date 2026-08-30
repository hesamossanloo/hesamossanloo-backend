import OpenAI from "openai";
import type { Config, Context } from "@netlify/functions";
import { authenticate, otherPair } from "./_shared/auth";
import { compareActivities } from "./_shared/compare";
import { json, options, readJson } from "./_shared/http";
import { getActivity, getChat, saveActivity, saveChat } from "./_shared/store";
import type { Activity, ChatMessage, ConflictResult } from "./_shared/types";

type ChatRequest = {
  sessionId?: string;
  accessCode: string;
  message: string;
};

type ExtractedActivity = {
  title: string;
  city: string;
  date: string;
  timeWindow: string;
  category: string;
  indoorOutdoor: string;
  foodInvolved: string;
  intensity: string;
  notes: string;
  commitment: "booked" | "planned" | "option" | "none";
  confidence: number;
};

type ExtractionResult = {
  candidates: ExtractedActivity[];
  shouldSave: boolean;
};

function getOpenAIKey() {
  const key = Netlify.env.get("OPENAI_API_KEY")?.trim();
  if (!key || key === "paste-your-openai-api-key-here" || key === "replace-me") return null;
  return key;
}

function isSecretFishing(message: string) {
  const text = message.toLowerCase();
  const asksForOther =
    /(what|which|tell|show|reveal|hint|guess|know|spill).*(hesam|jana|chris|christian|meike|other couple|they|them)/i.test(
      message,
    ) ||
    /(hesam|jana|chris|christian|meike|other couple).*(booked|chosen|picked|planned|doing|activity|secret)/i.test(
      message,
    );
  const asksForSecret = /(secret|surprise|hidden plan|private plan|what.*booked|what.*picked|what.*chosen)/i.test(message);
  return asksForOther && asksForSecret && !text.includes("similar") && !text.includes("conflict");
}

function isAccessOnlyMessage(message: string, accessCode: string) {
  if (message.trim() === accessCode.trim()) return true;
  const withoutAccessDetails = message
    .replace(/session\s*[:=]\s*[a-z0-9-]+/gi, "")
    .replace(/code\s*[:=]\s*[A-Za-z0-9_-]+/gi, "")
    .replace(/[,\s.;:-]+/g, "")
    .trim();
  return withoutAccessDetails.length === 0;
}

function accessConfirmedReply(pair: Activity["pair"]) {
  const couple = pair === "hj" ? "Hesam and Jana" : "Christian and Meike";
  return [
    `Success. Access confirmed for ${couple}.`,
    "",
    "Now please enter at least 3 surprise activity options. For each one, include the city, date, approximate time, and whether it is booked or just an idea.",
    "",
    "I will pick one without revealing anything about the other couple's private plan.",
  ].join("\n");
}

function coupleLabel(pair: Activity["pair"]) {
  return pair === "hj" ? "Hesam and Jana" : "Christian and Meike";
}

function prankReply() {
  return [
    "Nice try, but here is a picture of your childhood as a hint 😂",
    "",
    "[[GORILLA_PRANK]]",
  ].join("\n");
}

function normalizeCandidate(
  candidate: ExtractedActivity,
  sessionId: string,
  pair: Activity["pair"],
): Activity {
  return {
    pair,
    sessionId,
    title: candidate.title.trim().slice(0, 160),
    city: candidate.city.trim().slice(0, 80),
    date: candidate.date.trim().slice(0, 80),
    timeWindow: candidate.timeWindow.trim().slice(0, 80),
    category: candidate.category.trim().slice(0, 80),
    indoorOutdoor: candidate.indoorOutdoor.trim().slice(0, 80),
    foodInvolved: candidate.foodInvolved.trim().slice(0, 80),
    intensity: candidate.intensity.trim().slice(0, 80),
    notes: candidate.notes.trim().slice(0, 600),
    updatedAt: new Date().toISOString(),
  };
}

function chooseActivity(candidates: Activity[], conflicts: ConflictResult[]) {
  const safeIndex = conflicts.findIndex((item) => item.level === "none");
  if (safeIndex >= 0) return candidates[safeIndex];
  if (!conflicts.length) return candidates[0] ?? null;
  return null;
}

function candidateIsComplete(candidate: ExtractedActivity) {
  return Boolean(
    candidate.title.trim() &&
      candidate.city.trim() &&
      candidate.date.trim() &&
      candidate.timeWindow.trim() &&
      candidate.category.trim() &&
      candidate.indoorOutdoor.trim() &&
      candidate.foodInvolved.trim() &&
      candidate.intensity.trim(),
  );
}

async function extractActivities(
  openai: OpenAI,
  model: string,
  message: string,
  sessionId: string,
  history: ChatMessage[],
): Promise<ExtractionResult> {
  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "Extract surprise activity details from a user message. Return JSON only. If the user mentions multiple alternatives, return each as a separate candidate and set shouldSave false. Set shouldSave true only when there is exactly one clear booked or planned activity with enough details to compare. Use recent chat context only to resolve short confirmations such as 'yes, save that one'; if the confirmation is ambiguous, do not save. Preserve dates as the user expresses them when possible, such as '13 Oct' or '14 Oct'. If you must add a year, infer it from the session id, not from today's date.",
      },
      {
        role: "user",
        content: JSON.stringify({
          sessionId,
          recentContext: history.slice(-6).map((entry) => ({
            role: entry.role,
            content: entry.content,
          })),
          message,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "activity_extraction",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            shouldSave: { type: "boolean" },
            candidates: {
              type: "array",
              maxItems: 4,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  city: { type: "string" },
                  date: { type: "string" },
                  timeWindow: { type: "string" },
                  category: { type: "string" },
                  indoorOutdoor: { type: "string" },
                  foodInvolved: { type: "string" },
                  intensity: { type: "string" },
                  notes: { type: "string" },
                  commitment: {
                    type: "string",
                    enum: ["booked", "planned", "option", "none"],
                  },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
                required: [
                  "title",
                  "city",
                  "date",
                  "timeWindow",
                  "category",
                  "indoorOutdoor",
                  "foodInvolved",
                  "intensity",
                  "notes",
                  "commitment",
                  "confidence",
                ],
              },
            },
          },
          required: ["shouldSave", "candidates"],
        },
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as ExtractionResult;
  const candidates = parsed.candidates.filter(
    (candidate) => candidate.commitment !== "none" && candidate.confidence >= 0.65 && candidateIsComplete(candidate),
  );
  return {
    candidates,
    shouldSave:
      parsed.shouldSave &&
      candidates.length === 1 &&
      ["booked", "planned"].includes(candidates[0].commitment),
  };
}

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await readJson<ChatRequest>(req);
    const auth = authenticate(body.sessionId, body.accessCode);
    const message = body.message.trim().slice(0, 1000);
    if (!message) return json({ error: "Message is required." }, { status: 400 });

    const userMessage: ChatMessage = {
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };
    const history = await getChat(auth.sessionId, auth.pair);
    const otherActivity = await getActivity(auth.sessionId, otherPair(auth.pair));
    let ownActivity = await getActivity(auth.sessionId, auth.pair);
    let conflict = await compareActivities(ownActivity, otherActivity);

    async function finish(content: string, saved?: Activity | null) {
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
      };
      await saveChat(auth.sessionId, auth.pair, [...history, userMessage, assistantMessage]);
      return json({
        reply: assistantMessage.content,
        pair: auth.pair,
        coupleLabel: coupleLabel(auth.pair),
        savedActivity: saved
          ? {
              title: saved.title,
              city: saved.city,
              date: saved.date,
              timeWindow: saved.timeWindow,
              category: saved.category,
            }
          : null,
      });
    }

    if (isSecretFishing(message)) {
      return finish(prankReply());
    }

    if (isAccessOnlyMessage(message, body.accessCode)) {
      return finish(accessConfirmedReply(auth.pair));
    }

    const apiKey = getOpenAIKey();
    if (!apiKey) {
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content:
          "OpenAI is not configured yet. I can still save activity details and run basic metadata conflict checks once both couples submit.",
        createdAt: new Date().toISOString(),
      };
      await saveChat(auth.sessionId, auth.pair, [...history, userMessage, assistantMessage]);
      return json({ reply: assistantMessage.content, conflict });
    }

    const openai = new OpenAI({ apiKey });
    const model = Netlify.env.get("OPENAI_MODEL");
    if (!model) {
      return json({ error: "Missing required environment variable: OPENAI_MODEL" }, { status: 500 });
    }

    const extraction = await extractActivities(openai, model, message, auth.sessionId, history);
    let savedActivity: Activity | null = null;

    const candidateConflicts: Array<{
      conflict: ConflictResult;
    }> = [];
    const candidateActivities = extraction.candidates.map((candidate) =>
      normalizeCandidate(candidate, auth.sessionId, auth.pair),
    );

    if (otherActivity) {
      for (const candidateActivity of candidateActivities) {
        candidateConflicts.push({
          conflict: await compareActivities(candidateActivity, otherActivity),
        });
      }
    }

    const asksToReplace = /\b(replace|change|update|switch|overwrite)\b/i.test(message);
    if (ownActivity && extraction.candidates.length > 1 && !asksToReplace) {
      return finish(
        "I already picked and saved one activity for you. If you want to change it, say that clearly and send at least 3 new activity options.",
        ownActivity,
      );
    }

    if (extraction.candidates.length > 1 && extraction.candidates.length < 3) {
      return finish(
        "Please send at least 3 activity options. I will pick one without revealing anything about the other couple's private plan.",
      );
    }

    if (extraction.candidates.length >= 3) {
      const chosen = chooseActivity(
        candidateActivities,
        candidateConflicts.map((item) => item.conflict),
      );
      if (!chosen) {
        return finish(
          "I cannot safely pick from that set. Send 3 more activities that are more different from each other.",
        );
      }
      await saveActivity(chosen);
      ownActivity = chosen;
      savedActivity = chosen;
      return finish(
        `I picked one from your list and saved it: ${chosen.title}.`,
        savedActivity,
      );
    }

    if (extraction.shouldSave) {
      const candidate = candidateActivities[0];
      const candidateConflict = otherActivity ? await compareActivities(candidate, otherActivity) : null;
      if (candidateConflict && candidateConflict.level !== "none") {
        return finish(
          "That option overlaps too closely with the other private plan, so I did not save it. Send a different idea.",
        );
      }

      savedActivity = candidate;
      await saveActivity(savedActivity);
      ownActivity = savedActivity;
    }

    conflict = await compareActivities(ownActivity, otherActivity);
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are a private surprise-activity assistant for one couple. Use a clear, neutral, and practical tone. If a user's single clear activity was saved, say it was saved. Never reveal, name, hint at, confirm, deny, rank, or identify the other couple's title, venue, exact notes, address, link, date, category, or option overlap. If someone asks for the other couple's secret, refuse directly. If the user gives multiple options, ask for at least 3 options and never identify which option conflicts. Keep replies short.",
        },
        {
          role: "user",
          content: JSON.stringify({
            ownPair: auth.pair,
            ownActivity,
            savedActivity: savedActivity
              ? {
                  title: savedActivity.title,
                  city: savedActivity.city,
                  date: savedActivity.date,
                  timeWindow: savedActivity.timeWindow,
                  category: savedActivity.category,
                }
              : null,
            extractedCandidateCount: extraction.candidates.length,
            otherPublicStatus: otherActivity ? { submitted: true } : { submitted: false },
            conflict,
          }),
        },
        ...history.slice(-8).map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
        { role: "user", content: message },
      ],
    });

    return finish(response.output_text || "I could not produce a response. Try again.", savedActivity);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 });
  }
};

export const config: Config = {
  path: "/api/chat",
  method: ["POST", "OPTIONS"],
};
