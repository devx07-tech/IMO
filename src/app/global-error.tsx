"use client";

// Replaces the root layout when it fails, so it must render <html> and <body>
// itself and can't rely on globals.css having loaded.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f7f8fa",
          color: "#14181f",
          padding: 16,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>IMO Recharge is having trouble</h1>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Please try again in a moment.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              background: "#0d6efd",
              color: "#fff",
              border: 0,
              borderRadius: 12,
              padding: "10px 20px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
