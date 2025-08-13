import { NextResponse } from "next/server";

const apiKey = process.env.ELEVENLABS_API_KEY as string;
const apiBase = (process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io").replace(/\/$/, "");

export async function GET(
  _req: Request,
  { params }: { params: { conversationId: string } }
) {
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 });
  }
  const { conversationId } = params;
  try {
    const res = await fetch(`${apiBase}/v1/convai/conversations/${conversationId}`, {
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: "Upstream error", details: text }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json({ error: "Request failed", details: String(err) }, { status: 500 });
  }
}


