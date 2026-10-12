export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns ICE servers. STUN is free; TURN is needed for strict NATs (very
 * common on Iranian mobile carriers). Configure via env:
 *   TURN_URLS=turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349
 *   TURN_USERNAME=...  TURN_CREDENTIAL=...
 * Secrets stay server-side; the browser only receives short-lived config.
 */
export async function GET() {
  const iceServers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
  ];
  const turnUrls = (process.env.TURN_URLS || "").split(",").map((u) => u.trim()).filter(Boolean);
  if (turnUrls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({ urls: turnUrls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return Response.json({ iceServers }, { headers: { "Cache-Control": "no-store" } });
}
