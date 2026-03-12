import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { createContext, useContext, useEffect, useState } from 'react';
import { useReminderNotifications, requestNotificationPermission } from '@/hooks/useNotifications';

const SidebarContext = createContext({ collapsed: false, setCollapsed: (_: boolean) => {} });
export const useSidebarState = () => useContext(SidebarContext);

function NotificationManager() {
  useReminderNotifications();

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  return null;
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <NotificationManager />
      <div className="flex min-h-screen">
        <AppSidebar />
        <main className={`flex-1 p-6 lg:p-8 transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-60'}`}>
          <Outlet />
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
