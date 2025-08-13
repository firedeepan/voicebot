import { NextResponse } from "next/server";

const apiKey = process.env.ELEVENLABS_API_KEY as string;
const apiBase = (process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io").replace(/\/$/, "");

export async function GET(
  _req: Request,
  { params }: { params: { agentId: string } }
) {
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 });
  }
  const { agentId } = params;
  try {
    const res = await fetch(`${apiBase}/v1/convai/agents/${agentId}`, {
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

export async function PATCH(
  req: Request,
  { params }: { params: { agentId: string } }
) {
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 });
  }
  const { agentId } = params;
  try {
    const body = await req.json();
    const res = await fetch(`${apiBase}/v1/convai/agents/${agentId}`, {
      method: "PATCH",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const contentType = res.headers.get("content-type") || "";
    const result = contentType.includes("application/json") ? JSON.parse(text || "{}") : { raw: text };
    if (!res.ok) {
      return NextResponse.json({ error: "Upstream error", details: result }, { status: res.status });
    }
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ error: "Request failed", details: String(err) }, { status: 500 });
  }
}


