import { useEffect, useId, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";

interface ModalProps {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Optionaler Formular-Inhalt zwischen Titel und Aktionsleiste. */
  children?: ReactNode;
  /** Loest die Bestaetigungs-Schaltflaeche im Danger-Stil aus. */
  danger?: boolean;
  /** Laedt-Zustand: deaktiviert beide Schaltflaechen und aendert den Bestaetigungstext. */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Barrierefreies Bestaetigungs-/Aktionsfenster auf Basis des Design-Systems
 * (.modal-overlay/.modal/.modal-actions aus styles.css).
 */
export default function Modal({
  title,
  description,
  confirmLabel,
  cancelLabel = "Abbrechen",
  danger = false,
  busy = false,
  children,
  onConfirm,
  onClose
}: ModalProps): JSX.Element {
  const titleId = useId();
  const descriptionId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Escape schliesst das Fenster.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Fokus beim Oeffnen direkt auf die Bestaetigungs-Schaltflaeche.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  // Klick auf den Hintergrund (nicht auf den Inhalt) schliesst das Fenster.
  const handleOverlayMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        className={`modal ${danger ? "modal-danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <h2 id={titleId}>{title}</h2>
        {description ? (
          <p className="muted" id={descriptionId}>
            {description}
          </p>
        ) : null}
        {children}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Wird ausgeführt..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
