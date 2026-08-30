import { createHash, timingSafeEqual } from "node:crypto";
import { getCredential, saveCredential } from "./store";
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

export function hashCode(code: string) {
  return createHash("sha256").update(code.trim(), "utf8").digest("hex");
}

function hashesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function storedCodeMatches(sessionId: string, pair: PairId, accessCode: string) {
  const credential = await getCredential(sessionId, pair);
  if (!credential) return false;
  return hashesMatch(credential.codeHash, hashCode(accessCode));
}

async function storedCodeExists(sessionId: string, pair: PairId) {
  return Boolean(await getCredential(sessionId, pair));
}

export async function changeAccessCode(sessionId: string | undefined, accessCode: string, newCode: string) {
  const auth = await authenticate(sessionId, accessCode);
  await saveCredential({
    pair: auth.pair,
    sessionId: auth.sessionId,
    codeHash: hashCode(newCode),
    updatedAt: new Date().toISOString(),
  });
  return auth;
}

export async function authenticate(sessionId: string | undefined, accessCode: string): Promise<AuthResult> {
  const expectedSession = configuredSession();
  const requestedSession = sessionId?.trim() || expectedSession;
  if (requestedSession !== expectedSession) {
    throw new Error("Unknown session.");
  }

  const hjCode = requiredEnv("SECRET_KEEPER_HJ_CODE");
  const cmCode = requiredEnv("SECRET_KEEPER_CM_CODE");

  if (await storedCodeMatches(requestedSession, "hj", accessCode)) return { sessionId: requestedSession, pair: "hj" };
  if (await storedCodeMatches(requestedSession, "cm", accessCode)) return { sessionId: requestedSession, pair: "cm" };

  if (accessCode === hjCode) {
    if (await storedCodeExists(requestedSession, "hj")) {
      throw new Error("Hesam and Jana have changed their code. Use the new private code.");
    }
    return { sessionId: requestedSession, pair: "hj" };
  }

  if (accessCode === cmCode) {
    if (await storedCodeExists(requestedSession, "cm")) {
      throw new Error("Christian and Meike have changed their code. Use the new private code.");
    }
    return { sessionId: requestedSession, pair: "cm" };
  }

  throw new Error("Invalid access code.");
}

export function otherPair(pair: PairId): PairId {
  return pair === "hj" ? "cm" : "hj";
}
