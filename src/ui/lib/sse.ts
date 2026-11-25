/**
 * Minimal Server-Sent Events reader for fetch() responses (EventSource cannot
 * POST). Frames are separated by a blank line; only `data:` is used because
 * every payload carries its own `type`.
 */
export async function readEventStream<T>(
  response: Response,
  onEvent: (event: T) => void,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as T);
      boundary = buffer.indexOf("\n\n");
    }
  }
}
