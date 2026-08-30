import OpenAI from "openai";
import type { Config, Context } from "@netlify/functions";
import { authenticate, otherPair } from "./_shared/auth";
import { compareActivities } from "./_shared/compare";
import { json, options, readJson } from "./_shared/http";
import { getActivity, getChat, saveChat } from "./_shared/store";
import type { ChatMessage } from "./_shared/types";

type ChatRequest = {
  sessionId: string;
  accessCode: string;
  message: string;
};

function getOpenAIKey() {
  const key = Netlify.env.get("OPENAI_API_KEY")?.trim();
  if (!key || key === "paste-your-openai-api-key-here" || key === "replace-me") return null;
  return key;
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

    const ownActivity = await getActivity(auth.sessionId, auth.pair);
    const otherActivity = await getActivity(auth.sessionId, otherPair(auth.pair));
    const conflict = await compareActivities(ownActivity, otherActivity);
    const history = await getChat(auth.sessionId, auth.pair);

    const userMessage: ChatMessage = {
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };

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
    const model = Netlify.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are a private surprise-activity assistant for one couple. Help them choose or adjust their activity. You may know whether the other couple submitted and public conflict metadata, but never reveal the other couple's title, venue, exact notes, address, or link. Keep replies short and practical.",
        },
        {
          role: "user",
          content: JSON.stringify({
            ownPair: auth.pair,
            ownActivity,
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

    return json({ reply: assistantMessage.content, conflict });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 });
  }
};

export const config: Config = {
  path: "/api/chat",
  method: ["POST", "OPTIONS"],
};
