import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export function Dialog({
  children,
  onClose,
  wide = false,
  fullscreen = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  fullscreen?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const heading = dialog?.querySelector("h2");
    if (heading) heading.id = headingId;
    if (dialog && !dialog.open) dialog.showModal();
  }, [children, headingId]);
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? " wide" : ""}${fullscreen ? " fullscreen" : ""}`}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby={headingId}
    >
      <button
        className="close icon-button"
        aria-label="Schließen"
        onClick={() => ref.current?.close()}
      >
        <X size={20} />
      </button>
      {children}
    </dialog>
  );
}
