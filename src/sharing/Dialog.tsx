import { useEffect, useRef, type ReactNode } from "react";
import { X } from "@phosphor-icons/react/dist/csr/X";
import "./sharing.css";
export default function Dialog({
  title,
  children,
  onClose,
  returnFocus,
  context,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  returnFocus?: string;
  context?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    el.showModal();
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
        "sharing-dialog" + (context ? " manuscript-sharing-dialog" : "")
      }
      aria-labelledby="sharing-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="sharing-title">{title}</h2>
        <button
          className="icon"
          aria-label="Close sharing dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {context}
      <div className="sharing-body">{children}</div>
    </dialog>
  );
}
