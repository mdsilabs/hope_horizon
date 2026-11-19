import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Hope Horizon Academy — Results Portal",
    template: "%s · Hope Horizon Academy",
  },
  description:
    "Secure student results management portal for Hope Horizon Academy — results, dashboards, and verification for students, parents, teachers, and staff.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`}>
      <body className="flex min-h-screen flex-col font-sans print:block print:min-h-0">
        <ToastProvider>{children}</ToastProvider>
        <footer className="mt-auto border-t border-brand-100 bg-brand-50 px-4 py-4 text-center text-sm leading-6 text-brand-900 print:hidden">
          Developed By Silabs and Co Technologies Ltd.{" "}
          <span className="whitespace-nowrap">
            (<a href="https://silabs.com.ng" className="focus-ring rounded-sm font-medium underline underline-offset-2 hover:text-brand-700">silabs.com.ng</a>)
          </span>
        </footer>
      </body>
    </html>
  );
}
