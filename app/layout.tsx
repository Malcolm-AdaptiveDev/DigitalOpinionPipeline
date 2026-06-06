import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Persona Pipeline",
  description: "5-persona AI social network — real-time trending pipeline",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: "#0f1115",
          color: "#edf0f6",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
