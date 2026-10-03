import type { Metadata } from "next";
import { Afacad } from "next/font/google";
import Nav from "@/components/Nav";
import PageTurn from "@/components/PageTurn";
import "./globals.css";

// Variable font (no fixed weights) so font-weight can animate in the nav.
const afacad = Afacad({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lauren W. Wang",
  description: "Princeton CS PhD Student | HCI researcher",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={afacad.className}>
      <body>
        {/* Everything inside is one face of the cube the side quests page
            turns on, so the turn wraps the document rather than sitting in
            a page. */}
        <PageTurn>
          <Nav />
          {children}
        </PageTurn>
      </body>
    </html>
  );
}
