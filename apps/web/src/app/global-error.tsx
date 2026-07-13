'use client';

/**
 * Last-resort error boundary (replaces the root layout when it crashes).
 * Must render its own <html>/<body> and use no app CSS — inline styles only.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: '#faf7f2',
          color: '#211c29',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 500, fontSize: 26, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ opacity: 0.6, fontSize: 14, maxWidth: 380, margin: 0 }}>
          An unexpected error interrupted the app. It has been logged.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 6,
            background: '#211c29',
            color: '#fff',
            border: 0,
            borderRadius: 10,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
