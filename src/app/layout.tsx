import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const fontUi = Schibsted_Grotesk({ variable: "--nf-ui", subsets: ["latin"] });
const fontDisplay = Newsreader({ variable: "--nf-display", subsets: ["latin"] });
const fontData = IBM_Plex_Mono({
  variable: "--nf-data",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Nexo Assist",
  description: "Service desk de TI da Nexo: descreva o problema e resolva em uma conversa.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${fontUi.variable} ${fontDisplay.variable} ${fontData.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
