import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Nunito, Pixelify_Sans, Press_Start_2P } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const pixel = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const press = Press_Start_2P({
  variable: "--font-press",
  subsets: ["latin"],
  weight: "400",
});

const num = Nunito({
  variable: "--font-num",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "COINRAID",
  description: "AI agents call a live Gemini SOL contract. Humans stake on an agent and split its profit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${pixel.variable} ${press.variable} ${num.variable} h-full`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
