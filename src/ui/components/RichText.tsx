import { Fragment } from "react";

/** **bold** and "- " bullets only. Rendered as React nodes, so model output can never inject HTML. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        if (/^\s*[-•]\s+/.test(line)) {
          return (
            <p key={index} className="flex gap-2 pl-1">
              <span aria-hidden="true">•</span>
              <span>{inline(line.replace(/^\s*[-•]\s+/, ""))}</span>
            </p>
          );
        }
        return line.trim() === "" ? (
          <div key={index} className="h-1" />
        ) : (
          <p key={index}>{inline(line)}</p>
        );
      })}
    </div>
  );
}
