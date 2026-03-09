import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import NotificationBell from "./components/NotificationBell";
import "./globals.css";

export const metadata: Metadata = {
  title: "VDM - Congés et Notes de frais",
  description: "Gérez vos demandes de congés et notes de frais facilement avec VDM.",
  icons: {
    icon: "/logo.jpeg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="relative min-h-screen bg-white">
        {children}
        <div className="pointer-events-none absolute inset-0 flex justify-end p-4">
          <div className="pointer-events-auto">
            <NotificationBell />
          </div>
        </div>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
          }}
        />
      </body>
    </html>
  );
}
