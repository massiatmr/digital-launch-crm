import { Outlet, useLocation } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { EnablePushButton } from './EnablePushButton';
import { WorkspaceHeader } from './WorkspaceHeader';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

const SidebarContext = createContext({ collapsed: false, setCollapsed: (_: boolean) => {} });
export const useSidebarState = () => useContext(SidebarContext);

const isFocusRoute = (pathname: string) =>
  /^\/offers\/[^/]+\/studio/.test(pathname) || pathname.startsWith('/settings');

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();
  const prevCollapsedRef = useRef<boolean | null>(null);
  const wasFocusRef = useRef(false);

  useEffect(() => {
    const focus = isFocusRoute(location.pathname);
    if (focus && !wasFocusRef.current) {
      prevCollapsedRef.current = collapsed;
      setCollapsed(true);
      wasFocusRef.current = true;
    } else if (!focus && wasFocusRef.current) {
      if (prevCollapsedRef.current !== null) setCollapsed(prevCollapsedRef.current);
      wasFocusRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="flex min-h-screen">
        <WorkspaceHeader />
        {!isMobile && <AppSidebar />}
        <main className={`flex-1 transition-all duration-300 overflow-x-hidden pt-16 ${
          isMobile ? 'p-4 pb-24' : collapsed ? 'ml-16 p-6 lg:p-8' : 'ml-60 p-6 lg:p-8'
        }`}>
          <div className="flex justify-end mb-2">
            <EnablePushButton />
          </div>
          <Outlet />
        </main>
        {isMobile && <MobileBottomNav />}
      </div>
    </SidebarContext.Provider>
  );
}
