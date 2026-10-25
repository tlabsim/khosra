import type React from "react";
export default function Empty({
  icon: Icon,
  title,
  text,
  children,
  compact = false,
}: {
  icon: React.ElementType;
  title: string;
  text?: string;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={"empty-state" + (compact ? " empty-compact" : "")}>
      <div className="empty-illustration" aria-hidden="true">
        <span className="empty-sheet">
          <Icon size={30} weight="light" />
          <span />
          <span />
          <span />
        </span>
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}
