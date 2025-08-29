import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ExposeAuth } from "@/lib/auth/expose-auth";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Oxkair Platform",
  description: "Medical AI Suite for Healthcare Professionals",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <ExposeAuth />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
