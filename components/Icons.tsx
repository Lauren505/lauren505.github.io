type IconProps = { className?: string };

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "currentColor",
  "aria-hidden": true,
} as const;

export function LinkedIn(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05A4.17 4.17 0 0 1 17.6 8.7c4 0 4.4 2.5 4.4 5.8V21h-4v-5.6c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3v5.7h-4V9Z" />
    </svg>
  );
}

export function Scholar(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 1 9l11 6 9-4.9V16h2V9L12 3ZM5 13.2V17c0 1.7 3.1 3.4 7 3.4s7-1.7 7-3.4v-3.8l-7 3.8-7-3.8Z" />
    </svg>
  );
}

export function Twitter(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M22 5.9c-.7.3-1.5.6-2.4.7a4.1 4.1 0 0 0 1.8-2.3c-.8.5-1.7.8-2.6 1a4.1 4.1 0 0 0-7 3.7A11.6 11.6 0 0 1 3.4 4.7a4.1 4.1 0 0 0 1.3 5.5c-.7 0-1.3-.2-1.9-.5a4.1 4.1 0 0 0 3.3 4 4.2 4.2 0 0 1-1.9.1 4.1 4.1 0 0 0 3.8 2.9A8.3 8.3 0 0 1 2 18.4a11.6 11.6 0 0 0 6.3 1.8c7.5 0 11.7-6.3 11.7-11.8v-.5c.8-.6 1.5-1.3 2-2Z" />
    </svg>
  );
}

export function Mail(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h17A1.5 1.5 0 0 1 22 5.5v.3l-10 5.6-10-5.6v-.3Zm0 2.6V18a1.5 1.5 0 0 0 1.5 1.5h17A1.5 1.5 0 0 0 22 18V8.1l-9.5 5.4a1 1 0 0 1-1 0L2 8.1Z" />
    </svg>
  );
}

export function Paperclip(props: IconProps) {
  return (
    <svg {...base} width={15} height={15} {...props}>
      <path d="M16.5 6.5 8.7 14.3a1.8 1.8 0 0 0 2.6 2.6l7.8-7.9a3.6 3.6 0 0 0-5.1-5.1l-7.9 7.8a5.4 5.4 0 0 0 7.7 7.7l7.1-7.1-1.3-1.3-7.1 7.1a3.6 3.6 0 0 1-5.1-5.1l7.9-7.8a1.8 1.8 0 0 1 2.5 2.5Z" />
    </svg>
  );
}
