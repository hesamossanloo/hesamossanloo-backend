import { getStore } from "@netlify/blobs";
import type { Activity, ChatMessage, PairCredential, PairId } from "./types";

const store = getStore({ name: "secret-keeper", consistency: "strong" });

const activityKey = (sessionId: string, pair: PairId) =>
  `sessions/${sessionId}/activities/${pair}.json`;

const chatKey = (sessionId: string, pair: PairId) =>
  `sessions/${sessionId}/chats/${pair}.json`;

const credentialKey = (sessionId: string, pair: PairId) =>
  `sessions/${sessionId}/credentials/${pair}.json`;

export async function getActivity(sessionId: string, pair: PairId) {
  return (await store.get(activityKey(sessionId, pair), {
    type: "json",
  })) as Activity | null;
}

export async function saveActivity(activity: Activity) {
  await store.setJSON(activityKey(activity.sessionId, activity.pair), activity);
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
