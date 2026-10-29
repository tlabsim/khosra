import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { X } from "@phosphor-icons/react/dist/csr/X";
import {
  minTextSize,
  maxTextSize,
  fullscreenZoomOptions,
  type FullscreenZoom,
  type Preferences,
} from "./preferences";
import { Minus } from "@phosphor-icons/react/dist/csr/Minus";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { pageFormats, type PageFormat, type PageMargins } from "./pageGeometry";
import "./reader-settings.css";
import { lockScroll } from "../scrollLock";
export default function ReaderSettings({
  prefs,
  guest = false,
  onChange,
}: {
  prefs: Preferences;
  guest?: boolean;
  onChange: (prefs: Preferences) => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    panel.current?.close();
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    return lockScroll();
  }, [open]);
  return (
    <div className="reading-settings">
      <button
        ref={trigger}
        className="button quiet reader-settings-trigger"
        aria-label="Reading settings"
        aria-expanded={open}
        aria-controls="reader-preferences"
        aria-haspopup="dialog"
        onClick={() => {
          panel.current?.showModal();
          setOpen(true);
        }}
      >
        <SlidersHorizontal size={19} />
        <span>Preferences</span>
      </button>
      <dialog
        ref={panel}
        id="reader-preferences"
        className="reader-preferences-dialog"
        aria-label="Reader preferences"
        onClose={() => {
          if (!panel.current?.open) {
            setOpen(false);
            trigger.current?.focus({ preventScroll: true });
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const b = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            close();
        }}
      >
        <header className="reader-preferences-header">
          <h2>Reading preferences</h2>
          <button
            className="icon"
            aria-label="Close reading preferences"
            onClick={close}
          >
            <X size={19} />
          </button>
        </header>
        <div className="reader-preferences-body">
          <section className="reader-preferences-section">
            <h3>Typography</h3>
            <div className="reader-preferences-fields two-fields">
              <div className="reader-control-label">
                <span id="reader-text-size-label">Text size</span>
                <div
                  className="reader-size-stepper"
                  role="group"
                  aria-labelledby="reader-text-size-label"
                >
                  <button
                    type="button"
                    aria-label="Decrease text size"
                    disabled={prefs.size <= minTextSize}
                    onClick={() =>
                      onChange({
                        ...prefs,
                        size: Math.max(minTextSize, prefs.size - 1),
                      })
                    }
                  >
                    <Minus size={16} />
                  </button>
                  <output
                    aria-label="Current text size"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {prefs.size} pt
                  </output>
                  <button
                    type="button"
                    aria-label="Increase text size"
                    disabled={prefs.size >= maxTextSize}
                    onClick={() =>
                      onChange({
                        ...prefs,
                        size: Math.min(maxTextSize, prefs.size + 1),
                      })
                    }
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <label>
                Line spacing
                <select
                  value={prefs.leading}
                  onChange={(e) =>
                    onChange({ ...prefs, leading: Number(e.target.value) })
                  }
                >
                  <option value={1.6}>Close</option>
                  <option value={1.9}>Comfortable</option>
                  <option value={2.2}>Open</option>
                </select>
              </label>
            </div>
          </section>
          <section className="reader-preferences-section">
            <h3>Paper</h3>
            <div className="reader-preferences-fields two-fields reader-page-fields">
              {prefs.mode !== "continuous" && (
                <label>
                  Page format
                  <select
                    value={prefs.format}
                    onChange={(e) =>
                      onChange({
                        ...prefs,
                        format: e.target.value as PageFormat,
                      })
                    }
                  >
                    {Object.entries(pageFormats).map(([value, format]) => (
                      <option key={value} value={value}>
                        {format.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Margins
                <select
                  value={prefs.margins}
                  onChange={(e) =>
                    onChange({
                      ...prefs,
                      margins: e.target.value as PageMargins,
                    })
                  }
                >
                  <option value="tight">Tight</option>
                  <option value="normal">Normal</option>
                  <option value="relaxed">Relaxed</option>
                </select>
              </label>
            </div>

            <div className="reader-paper-fields">
              <div className="reader-color-field">
                <span id="reader-paper-color" className="reader-control-label">
                  Page color
                </span>
                <div
                  className="reader-color-choices"
                  role="radiogroup"
                  aria-labelledby="reader-paper-color"
                >
                  {(["ivory", "white", "sepia"] as const).map((paper) => (
                    <label
                      key={paper}
                      className={`reader-color-choice reader-color-${paper}`}
                    >
                      <input
                        type="radio"
                        name="paper-color"
                        value={paper}
                        checked={prefs.paper === paper}
                        onChange={() => onChange({ ...prefs, paper })}
                      />
                      <span>
                        <i aria-hidden="true" />
                        {paper[0].toUpperCase() + paper.slice(1)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <label>
                Paper texture
                <select
                  value={prefs.texture}
                  onChange={(e) =>
                    onChange({
                      ...prefs,
                      texture: e.target.value as Preferences["texture"],
                    })
                  }
                >
                  <option value="smooth">Smooth</option>
                  <option value="grain">Grain</option>
                  <option value="linen">Linen</option>
                </select>
              </label>
            </div>
          </section>
          <section className="reader-preferences-section">
            <h3>Reading</h3>
            {prefs.mode !== "continuous" && (
              <label className="reader-fullscreen-zoom">
                Fullscreen zoom
                <select
                  value={prefs.fullscreenZoom}
                  onChange={(e) =>
                    onChange({
                      ...prefs,
                      fullscreenZoom: e.target.value as FullscreenZoom,
                    })
                  }
                >
                  {Object.entries(fullscreenZoomOptions).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
            {(
              [
                ...(!guest
                  ? [
                      ["selectable", "Text selectable"],
                      ["showIds", "Show paragraph IDs"],
                    ]
                  : []),
                ["progress", "Show reading progress"],
                ...(prefs.mode !== "continuous"
                  ? [
                      ["flip", "Animate page turns"],
                      ["drag", "Drag to turn pages"],
                    ]
                  : []),
              ] as [
                "selectable" | "showIds" | "flip" | "drag" | "progress",
                string,
              ][]
            ).map(([key, label]) => (
              <label key={key} className="reader-option-row">
                <span className="reader-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={prefs[key]}
                    onChange={(e) =>
                      onChange({ ...prefs, [key]: e.target.checked })
                    }
                  />
                  <span className="reader-switch-track" aria-hidden="true" />
                </span>
                <span>
                  {label}
                  {key === "drag" && prefs.drag && (
                    <small className="reader-option-hint">
                      {prefs.selectable
                        ? "Hold Shift to select text with the mouse."
                        : "Drag left or right with the mouse."}
                    </small>
                  )}
                </span>
              </label>
            ))}
          </section>
        </div>
      </dialog>
    </div>
  );
}
