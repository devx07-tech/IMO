"use client";

import { useEffect, useRef } from "react";
import { HelpCircle, X } from "lucide-react";

interface HelpVideoButtonProps {
  src: string;
  title: string;
  /** Optional short text shown above the video. */
  description?: string;
  /** Overrides the default round button styling of the "?" trigger. */
  triggerClassName?: string;
  iconClassName?: string;
}

const DEFAULT_TRIGGER =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent-soft text-accent shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent hover:text-white active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

/**
 * A "?" button that opens a video guide in a modal. Uses the native <dialog>
 * element for focus trapping, Esc-to-close and backdrop for free. The video
 * isn't downloaded until the dialog is opened (preload="none").
 */
export function HelpVideoButton({
  src,
  title,
  description,
  triggerClassName = DEFAULT_TRIGGER,
  iconClassName = "h-5 w-5",
}: HelpVideoButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Esc closes the dialog natively without going through close(), so also
  // pause on the dialog's own close event.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const stop = () => videoRef.current?.pause();
    dialog.addEventListener("close", stop);
    return () => dialog.removeEventListener("close", stop);
  }, []);

  const open = () => {
    dialogRef.current?.showModal();
    videoRef.current?.play().catch(() => {
      // Autoplay can be blocked; the visible controls let the user start it.
    });
  };

  const close = () => {
    videoRef.current?.pause();
    dialogRef.current?.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`Watch video: ${title}`}
        title={title}
        className={triggerClassName}
      >
        <HelpCircle className={iconClassName} aria-hidden="true" />
      </button>

      <dialog
        ref={dialogRef}
        aria-label={title}
        onClick={(e) => {
          // Clicking the backdrop (the dialog element itself) closes it.
          if (e.target === dialogRef.current) close();
        }}
        className="m-auto w-[min(92vw,380px)] overflow-visible rounded-card bg-transparent p-0 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="rounded-card bg-surface p-3 shadow-card">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <button
              type="button"
              onClick={close}
              aria-label="Close video"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {description && (
            <p className="mb-2 px-1 text-xs text-muted">{description}</p>
          )}
          <video
            ref={videoRef}
            src={src}
            controls
            playsInline
            preload="none"
            className="mx-auto aspect-[720/1606] max-h-[75vh] w-full rounded-input bg-black object-contain"
          >
            Your browser can&apos;t play this video.
          </video>
        </div>
      </dialog>
    </>
  );
}
