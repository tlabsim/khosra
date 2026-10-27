import { useEffect, useRef, useId, type ReactNode } from "react";
import { X } from "@phosphor-icons/react/dist/csr/X";
import "./sharing.css";
export default function Dialog({
  title,
  children,
  onClose,
  returnFocus,
  context,
  closeLabel = "Close sharing dialog",
  initialFocus,
  className = "",
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  returnFocus?: string;
  context?: ReactNode;
  closeLabel?: string;
  initialFocus?: string;
  className?: string;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    el.showModal();
    if (initialFocus) el.querySelector<HTMLElement>(initialFocus)?.focus();
    const old = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      el.close();
      document.documentElement.style.overflow = old;
      if (focused?.isConnected && focused !== document.body) focused.focus();
      else if (returnFocus)
        document.querySelector<HTMLElement>(returnFocus)?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={
        "sharing-dialog" +
        (context ? " manuscript-sharing-dialog" : "") +
        " " +
        className
      }
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button className="icon" aria-label={closeLabel} onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {context}
      <div className="sharing-body">{children}</div>
      {footer}
    </dialog>
  );
}
