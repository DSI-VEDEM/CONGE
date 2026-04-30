import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import GlobalNotificationBell from "./components/GlobalNotificationBell";
import { NotificationBellProvider } from "./components/notification-bell-context";
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
        <NotificationBellProvider>
          {children}
          <div className="pointer-events-none fixed inset-x-0 top-[72px] z-40 flex justify-end px-4 py-2 lg:absolute lg:inset-0 lg:top-0 lg:p-4">
            <div className="pointer-events-auto p-4">
              <GlobalNotificationBell />
            </div>
          </div>
        </NotificationBellProvider>
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
