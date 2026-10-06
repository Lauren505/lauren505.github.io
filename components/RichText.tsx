import { Fragment } from "react";

const MARK = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

/**
 * Renders a content string, turning [label](href) into links and **text** into
 * bold. Everything else is plain text — this is deliberately not a full
 * markdown parser.
 */
export default function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MARK)) {
    const [full, label, href, bold] = match;
    const start = match.index ?? 0;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      bold !== undefined ? (
        <strong key={start}>{bold}</strong>
      ) : (
        <a key={start} href={href}>
          {label}
        </a>
      ),
    );
    cursor = start + full.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}
