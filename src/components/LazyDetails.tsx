import { useState, type ReactNode } from "react";
export default function LazyDetails({
  summary,
  children,
  className,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: () => ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={className}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{summary}</summary>
      {open && children()}
    </details>
  );
}
