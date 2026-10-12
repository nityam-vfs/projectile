import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Planwise — Project scheduling", description: "A focused project planning and scheduling workspace." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
