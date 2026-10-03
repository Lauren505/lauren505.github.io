import { Fragment } from "react";

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Renders a content string, turning [label](href) into links. Everything else
 * is plain text — this is deliberately not a full markdown parser.
 */
export default function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(LINK)) {
    const [full, label, href] = match;
    const start = match.index ?? 0;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <a key={start} href={href}>
        {label}
      </a>,
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
