import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 ml-16 p-6 lg:p-8 transition-all duration-300 has-[~aside[class*=w-60]]:ml-60">
        <Outlet />
      </main>
    </div>
  );
}
