import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { AiFloatingButton } from './AiFloatingButton';
import { EnablePushButton } from './EnablePushButton';
import { createContext, useContext, useEffect, useState } from 'react';
import { useReminderNotifications, requestNotificationPermission } from '@/hooks/useNotifications';
import { useIsMobile } from '@/hooks/use-mobile';

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
  const isMobile = useIsMobile();

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <NotificationManager />
      <div className="flex min-h-screen">
        {!isMobile && <AppSidebar />}
        <main className={`flex-1 transition-all duration-300 overflow-x-hidden ${
          isMobile ? 'p-4 pb-24' : collapsed ? 'ml-16 p-6 lg:p-8' : 'ml-60 p-6 lg:p-8'
        }`}>
          <div className="flex justify-end mb-2">
            <EnablePushButton />
          </div>
          <Outlet />
        </main>
        {isMobile && <MobileBottomNav />}
        <AiFloatingButton />
      </div>
    </SidebarContext.Provider>
  );
}
