/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

const apiKey = process.env.ELEVENLABS_API_KEY as string;
const apiBase = (process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io").replace(/\/$/, "");

export async function GET(req: Request) {
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 });
  }
  try {
    // Pass-through pagination if provided; support single voice lookup
    const url = new URL(req.url);
    const nextPageToken = url.searchParams.get("next_page_token");
    const pageSize = url.searchParams.get("page_size");
    const voiceId = url.searchParams.get("voice_id");

    if (voiceId) {
      const singleUrl = `${apiBase}/v2/voices/${voiceId}`;
      const r = await fetch(singleUrl, { headers: { "xi-api-key": apiKey }, cache: "no-store" });
      const t = await r.text();
      const ct = r.headers.get("content-type") || "";
      const json = ct.includes("application/json") ? JSON.parse(t || "{}") : { raw: t };
      if (!r.ok) {
        return NextResponse.json({ error: "Upstream error", details: json }, { status: r.status });
      }
      return NextResponse.json({ voices: [json] });
    }

    const voicesUrl = new URL(`${apiBase}/v2/voices`);
    if (nextPageToken) voicesUrl.searchParams.set("next_page_token", nextPageToken);
    voicesUrl.searchParams.set("page_size", pageSize || "100");

    const res = await fetch(voicesUrl.toString(), {
      headers: {
        "xi-api-key": apiKey,
      },
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


