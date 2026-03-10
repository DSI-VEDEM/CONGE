"use client";

import { createContext, useContext, useMemo, useState } from "react";

type NotificationBellContextValue = {
  hasDedicatedBell: boolean;
  setHasDedicatedBell: (value: boolean) => void;
};

const NotificationBellContext = createContext<NotificationBellContextValue>({
  hasDedicatedBell: false,
  setHasDedicatedBell: () => {},
});

export function NotificationBellProvider({ children }: { children: React.ReactNode }) {
  const [hasDedicatedBell, setHasDedicatedBell] = useState(false);
  const value = useMemo(
    () => ({ hasDedicatedBell, setHasDedicatedBell }),
    [hasDedicatedBell]
  );
  return <NotificationBellContext.Provider value={value}>{children}</NotificationBellContext.Provider>;
}

export function useNotificationBellContext() {
  return useContext(NotificationBellContext);
}
