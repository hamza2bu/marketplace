"use client";

// Last-resort page when even the root layout fails, so it can't use
// translations: it says the same thing in all three languages.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem" }}>
        <h1>משהו השתבש · حدث خطأ ما · Something went wrong</h1>
        <button type="button" onClick={reset} style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
          ניסיון נוסף · حاول مرة أخرى · Try again
        </button>
      </body>
    </html>
  );
}
