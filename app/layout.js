import "./globals.css";

export const metadata = {
  title: "ANDREV Approval UI",
  description: "Generate, review, and schedule posts from topic and context.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
