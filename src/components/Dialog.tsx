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
  const pointerStartedOutside = useRef(false);
  const headingId = useId();
  function isOutside(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  }
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
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        // Handle Escape directly: embedded browsers may omit the native cancel event.
        // A nested cooking panel must handle its own Escape without closing this dialog.
        const target = event.target as Element;
        if (target.closest("dialog") !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.close();
      }}
      onPointerDown={(event) => {
        pointerStartedOutside.current = event.button === 0 && isOutside(event);
      }}
      onPointerCancel={() => {
        pointerStartedOutside.current = false;
      }}
      onClick={(event) => {
        const dismiss = pointerStartedOutside.current && isOutside(event);
        pointerStartedOutside.current = false;
        if (dismiss) event.currentTarget.close();
      }}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        event.currentTarget.close();
      }}
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
