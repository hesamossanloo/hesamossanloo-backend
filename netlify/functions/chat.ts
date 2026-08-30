import OpenAI from "openai";
import type { Config, Context } from "@netlify/functions";
import { authenticate, otherPair } from "./_shared/auth";
import { compareActivities } from "./_shared/compare";
import { json, options, readJson } from "./_shared/http";
import { getActivity, getChat, saveActivity, saveChat } from "./_shared/store";
import type { Activity, ChatMessage, ConflictResult } from "./_shared/types";

type ChatRequest = {
  sessionId: string;
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

    if (extraction.shouldSave) {
      savedActivity = normalizeCandidate(extraction.candidates[0], auth.sessionId, auth.pair);
      await saveActivity(savedActivity);
      ownActivity = savedActivity;
    }

    const candidateConflicts: Array<{
      candidateTitle: string;
      conflict: ConflictResult;
    }> = [];

    if (otherActivity) {
      for (const candidate of extraction.candidates) {
        const candidateActivity = normalizeCandidate(candidate, auth.sessionId, auth.pair);
        candidateConflicts.push({
          candidateTitle: candidateActivity.title,
          conflict: await compareActivities(candidateActivity, otherActivity),
        });
      }
    }

    conflict = await compareActivities(ownActivity, otherActivity);
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are a private surprise-activity assistant for one couple. Help them choose or adjust their activity. If a user's single clear activity was saved, say it was saved. If the user gives multiple options, do not claim they are saved. The candidateConflicts list is authoritative and compares each of this user's own candidates against the other couple's hidden saved activity. Do not treat candidateConflicts as comparisons between the user's own options. If any candidateConflict level is conflict or possible, clearly tell the user that option overlaps with the other couple's hidden plan and recommend the safer distinct option. You may know whether the other couple submitted and public conflict metadata, but never reveal the other couple's title, venue, exact notes, address, or link. Keep replies short and practical.",
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
            candidateConflicts,
            otherPublicStatus: otherActivity
              ? {
                  submitted: true,
                  city: otherActivity.city,
                  date: otherActivity.date,
                  timeWindow: otherActivity.timeWindow,
                  category: otherActivity.category,
                  indoorOutdoor: otherActivity.indoorOutdoor,
                  foodInvolved: otherActivity.foodInvolved,
                  intensity: otherActivity.intensity,
                }
              : { submitted: false },
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

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: response.output_text || "I could not produce a response. Try again.",
      createdAt: new Date().toISOString(),
    };
    await saveChat(auth.sessionId, auth.pair, [...history, userMessage, assistantMessage]);

    return json({
      reply: assistantMessage.content,
      conflict,
      savedActivity: savedActivity
        ? {
            title: savedActivity.title,
            city: savedActivity.city,
            date: savedActivity.date,
            timeWindow: savedActivity.timeWindow,
            category: savedActivity.category,
          }
        : null,
      candidateConflicts,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 });
  }
};

export const config: Config = {
  path: "/api/chat",
  method: ["POST", "OPTIONS"],
};
