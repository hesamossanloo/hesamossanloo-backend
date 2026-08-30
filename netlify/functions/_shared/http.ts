const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "https://hesam.info",
  "Vary": "Origin",
};

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function options() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export function readJson<T>(req: Request): Promise<T> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Expected JSON request body.");
  }
  return req.json() as Promise<T>;
}
