import type { PairId } from "./types";

type AuthResult = {
  sessionId: string;
  pair: PairId;
};

function requiredEnv(key: string) {
  const value = Netlify.env.get(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function configuredSession() {
  return requiredEnv("SECRET_KEEPER_SESSION");
}

export function authenticate(sessionId: string, accessCode: string): AuthResult {
  const expectedSession = configuredSession();
  if (sessionId !== expectedSession) {
    throw new Error("Unknown session.");
  }

  const hjCode = requiredEnv("SECRET_KEEPER_HJ_CODE");
  const cmCode = requiredEnv("SECRET_KEEPER_CM_CODE");

  if (accessCode === hjCode) return { sessionId, pair: "hj" };
  if (accessCode === cmCode) return { sessionId, pair: "cm" };

  throw new Error("Invalid access code.");
}

export function otherPair(pair: PairId): PairId {
  return pair === "hj" ? "cm" : "hj";
}
