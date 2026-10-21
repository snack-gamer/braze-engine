import { useEffect, useState } from "react";

type CommittedTextInputProps = Readonly<{
  value: string;
  ariaLabel: string;
  onCommit: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
}>;

export function CommittedTextInput({
  value,
  ariaLabel,
  onCommit,
  className,
  autoFocus,
}: CommittedTextInputProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.trim();
    if (!next) setDraft(value);
    else if (next !== value) onCommit(next);
  };

  return (
    <input
      className={className}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
