import { useId, useState, type ComponentPropsWithoutRef } from "react";
import { Eye } from "@phosphor-icons/react/dist/csr/Eye";
import { EyeSlash } from "@phosphor-icons/react/dist/csr/EyeSlash";

export default function PasswordInput({
  id,
  disabled,
  ...props
}: Omit<ComponentPropsWithoutRef<"input">, "type">) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="password-field">
      <input
        {...props}
        id={inputId}
        disabled={disabled}
        type={revealed ? "text" : "password"}
      />
      <button
        className="password-reveal"
        type="button"
        aria-label={revealed ? "Hide password" : "Show password"}
        aria-controls={inputId}
        aria-pressed={revealed}
        disabled={disabled}
        onClick={() => setRevealed(!revealed)}
      >
        {revealed ? (
          <EyeSlash size={20} aria-hidden="true" />
        ) : (
          <Eye size={20} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
