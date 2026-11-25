import { describe, expect, it } from "vitest";
import { readEventStream } from "./sse";

function responseFrom(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  );
}

describe("readEventStream", () => {
  it("parses whole frames", async () => {
    const events: unknown[] = [];
    await readEventStream(
      responseFrom(['event: a\ndata: {"type":"a"}\n\nevent: b\ndata: {"type":"b","n":1}\n\n']),
      (event) => events.push(event),
    );
    expect(events).toEqual([{ type: "a" }, { type: "b", n: 1 }]);
  });

  it("reassembles frames split across network chunks", async () => {
    const events: unknown[] = [];
    await readEventStream(
      responseFrom([
        'event: a\ndata: {"type"',
        ':"a","text":"olá"}\n',
        "\nevent: b\ndata: {",
        '"type":"b"}\n\n',
      ]),
      (event) => events.push(event),
    );
    expect(events).toEqual([{ type: "a", text: "olá" }, { type: "b" }]);
  });

  it("ignores frames without data and tolerates an empty body", async () => {
    const events: unknown[] = [];
    await readEventStream(responseFrom([": keep-alive\n\n"]), (event) => events.push(event));
    expect(events).toEqual([]);
  });
});
