import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { Eraser } from "@phosphor-icons/react/dist/csr/Eraser";
import { Flag } from "@phosphor-icons/react/dist/csr/Flag";
import "./paragraph-editor.css";
export default function ParagraphEditor(props: {
  label: number;
  value: string;
  focus: { at: number };
  onChange: (value: string) => void;
  onFinish: () => void;
  onClear: () => void;
  onSplit: (start: number, end: number) => boolean;
  onJoin: (direction: -1 | 1) => boolean;
  onDelete: () => boolean;
  onFlag: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (confirmDelete) cancelButton.current?.focus();
  }, [confirmDelete]);
  const textarea = useRef<HTMLTextAreaElement>(null),
    transitioning = useRef(false),
    shift = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  useLayoutEffect(() => {
    const el = textarea.current!;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  useLayoutEffect(() => {
    transitioning.current = false;
    const el = textarea.current!;
    el.focus();
    el.setSelectionRange(props.focus.at, props.focus.at);
    el.scrollIntoView({ block: "nearest" });
  }, [props.focus]);
  function split(start: number, end: number) {
    transitioning.current = true;
    if (!latest.current.onSplit(start, end)) transitioning.current = false;
  }
  useEffect(() => {
    const el = textarea.current!;
    const input = (event: InputEvent) => {
      if (event.isComposing || shift.current) return;
      if (
        event.inputType === "insertParagraph" ||
        event.inputType === "insertLineBreak"
      ) {
        event.preventDefault();
        split(el.selectionStart, el.selectionEnd);
      }
    };
    el.addEventListener("beforeinput", input);
    return () => el.removeEventListener("beforeinput", input);
  }, []);
  function cancelDelete() {
    setConfirmDelete(false);
    textarea.current?.focus();
  }
  return (
    <div
      className="paragraph-edit-session"
      onBlur={(event) => {
        if (
          transitioning.current ||
          event.currentTarget.contains(event.relatedTarget as Node | null)
        )
          return;
        props.onFinish();
      }}
      onKeyDownCapture={(event) => {
        if (confirmDelete && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelDelete();
        }
      }}
    >
      <textarea
        ref={textarea}
        className="paragraph-editor"
        aria-label={`Edit paragraph P${props.label}`}
        aria-describedby={confirmDelete ? undefined : "paragraph-keyboard-hint"}
        value={props.value}
        readOnly={confirmDelete}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyUp={() => {
          shift.current = false;
        }}
        onKeyDown={(event) => {
          if (confirmDelete) return;
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          const el = event.currentTarget;
          shift.current = event.shiftKey;
          if (
            event.key === "Escape" ||
            (event.key === "Enter" && (event.ctrlKey || event.metaKey))
          ) {
            event.preventDefault();
            props.onFinish();
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            split(el.selectionStart, el.selectionEnd);
          }
          if (
            el.selectionStart !== el.selectionEnd ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          )
            return;
          const direction =
            event.key === "Backspace" && el.selectionStart === 0
              ? -1
              : event.key === "Delete" &&
                  el.selectionStart === props.value.length
                ? 1
                : 0;
          if (direction) {
            transitioning.current = true;
            if (props.onJoin(direction as -1 | 1)) event.preventDefault();
            else transitioning.current = false;
          }
        }}
      />
      <div
        className={
          "paragraph-edit-controls" +
          (confirmDelete ? " confirming-delete" : "")
        }
        role="toolbar"
        aria-label={`Paragraph P${props.label} tools`}
      >
        {confirmDelete ? (
          <>
            <span className="paragraph-delete-question" role="status">
              Delete P{props.label}?
            </span>
            <button
              className="button quiet compact paragraph-delete"
              aria-label={`Confirm delete P${props.label}`}
              onClick={() => {
                transitioning.current = true;
                if (!props.onDelete()) {
                  transitioning.current = false;
                  cancelDelete();
                }
              }}
            >
              <Check size={18} /> Confirm
            </button>
            <button
              className="button quiet compact"
              ref={cancelButton}
              aria-label="Cancel delete"
              onClick={cancelDelete}
            >
              <X size={18} /> Cancel
            </button>
          </>
        ) : (
          <>
            <button className="button quiet compact" onClick={props.onFinish}>
              <Check size={17} />
              Done
            </button>
            <button
              className="button quiet compact"
              aria-label={`Insert after P${props.label}`}
              onClick={() =>
                split(
                  textarea.current!.selectionStart,
                  textarea.current!.selectionEnd,
                )
              }
            >
              <Plus size={17} />
              <span>
                New<span className="paragraph-new-caption"> paragraph</span>
              </span>
            </button>
            <span className="paragraph-edit-spacer" />
            <button
              className="icon"
              title="Flag paragraph"
              aria-label={`Flag P${props.label}`}
              onClick={props.onFlag}
            >
              <Flag size={17} />
            </button>
            <button
              className="icon"
              title="Clear text (keep paragraph)"
              aria-label={`Clear text in P${props.label}`}
              disabled={!props.value}
              onClick={() => {
                props.onClear();
                textarea.current?.focus();
              }}
            >
              <Eraser size={17} />
            </button>
            <button
              className="button quiet compact paragraph-delete"
              aria-label={`Delete paragraph P${props.label}`}
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              <Trash size={17} />
              Delete
            </button>
          </>
        )}
      </div>
      {!confirmDelete && (
        <small id="paragraph-keyboard-hint" className="paragraph-keyboard-hint">
          Enter: new paragraph · Shift+Enter: line break
        </small>
      )}
    </div>
  );
}
