import { getStore } from "@netlify/blobs";
import type { Activity, ChatMessage, PairCredential, PairId, PlanCity } from "./types";

const store = getStore({ name: "secret-keeper", consistency: "strong" });

const legacyActivityKey = (sessionId: string, pair: PairId) =>
  `sessions/${sessionId}/activities/${pair}.json`;

const activityKey = (sessionId: string, pair: PairId, city: PlanCity) =>
  `sessions/${sessionId}/activities/${pair}/${city}.json`;

const chatKey = (sessionId: string, pair: PairId) =>
  `sessions/${sessionId}/chats/${pair}.json`;

const credentialKey = (sessionId: string, pair: PairId) =>
  `sessions/${sessionId}/credentials/${pair}.json`;

function inferCity(activity: Omit<Activity, "cityKey"> | Activity): PlanCity | null {
  const text = `${activity.city} ${activity.title}`.toLowerCase();
  if (text.includes("tokyo")) return "tokyo";
  if (text.includes("osaka")) return "osaka";
  return "cityKey" in activity ? activity.cityKey : null;
}

export async function getActivity(sessionId: string, pair: PairId, city: PlanCity) {
  const activity = (await store.get(activityKey(sessionId, pair, city), {
    type: "json",
  })) as Activity | null;
  if (activity) return activity;

  const legacy = (await store.get(legacyActivityKey(sessionId, pair), {
    type: "json",
  })) as (Omit<Activity, "cityKey"> | Activity) | null;
  if (!legacy || inferCity(legacy) !== city) return null;
  return { ...legacy, cityKey: city } as Activity;
}

export async function getActivities(sessionId: string, pair: PairId) {
  const [tokyo, osaka] = await Promise.all([
    getActivity(sessionId, pair, "tokyo"),
    getActivity(sessionId, pair, "osaka"),
  ]);
  return { tokyo, osaka };
}

export async function saveActivity(activity: Activity) {
  await store.setJSON(activityKey(activity.sessionId, activity.pair, activity.cityKey), activity);
}

export async function getChat(sessionId: string, pair: PairId) {
  return ((await store.get(chatKey(sessionId, pair), {
    type: "json",
  })) as ChatMessage[] | null) ?? [];
}

export async function saveChat(sessionId: string, pair: PairId, messages: ChatMessage[]) {
  await store.setJSON(chatKey(sessionId, pair), messages.slice(-20));
}

export async function getCredential(sessionId: string, pair: PairId) {
  return (await store.get(credentialKey(sessionId, pair), {
    type: "json",
  })) as PairCredential | null;
}

export async function saveCredential(credential: PairCredential) {
  await store.setJSON(credentialKey(credential.sessionId, credential.pair), credential);
}
