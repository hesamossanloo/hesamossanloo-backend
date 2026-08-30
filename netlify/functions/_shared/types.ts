export type PairId = "hj" | "cm";

export type Activity = {
  pair: PairId;
  sessionId: string;
  title: string;
  city: string;
  date: string;
  timeWindow: string;
  category: string;
  indoorOutdoor: string;
  foodInvolved: string;
  intensity: string;
  notes: string;
  updatedAt: string;
};

export type PairSummary = {
  pair: PairId;
  submitted: boolean;
  city?: string;
  date?: string;
  timeWindow?: string;
  category?: string;
  indoorOutdoor?: string;
  foodInvolved?: string;
  intensity?: string;
  updatedAt?: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type ConflictResult = {
  level: "none" | "possible" | "conflict" | "waiting";
  publicMessage: string;
  reasons: string[];
  suggestions: string[];
};

export type PairCredential = {
  pair: PairId;
  sessionId: string;
  codeHash: string;
  updatedAt: string;
};
