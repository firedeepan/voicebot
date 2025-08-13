import { NextResponse } from "next/server";

const apiKey = process.env.ELEVENLABS_API_KEY as string;
const apiBase = (process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io").replace(/\/$/, "");

export async function GET() {
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 });
  }
  try {
    const res = await fetch(`${apiBase}/v1/convai/agents`, {
      headers: {
        "xi-api-key": apiKey,
      },
      // Ensure Edge-friendly fetch
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


