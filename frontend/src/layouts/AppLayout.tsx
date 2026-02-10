import { Outlet, useLocation } from "react-router-dom";
import TopBar from "@/components/chat/TopBar";
import Sidebar from "@/components/chat/Sidebar";
import MobileBottomNav from "@/components/chat/MobileBottomNav";
import { cn } from "@/lib/utils";

const AppLayout = () => {
  const location = useLocation();
  const isChatPage = location.pathname === "/app/chat";

  return (
    <div className={cn("min-h-screen bg-background relative", isChatPage && "chat-page-active")}>
      {/* Grid overlay */}
      <div className="fixed inset-0 grid-overlay" />
      
      {/* Fog overlay */}
      <div className="fixed inset-0 fog-overlay" />
      
      {/* Top bar */}
      <TopBar />
      
      {/* Sidebar - desktop only */}
      <Sidebar />
      
      {/* Mobile Bottom Navigation - hidden on chat page, visible on other pages */}
      {!isChatPage && <MobileBottomNav />}
      
      {/* Main content area - mobile has bottom nav (64px) + safe area on non-chat pages */}
      <main className={cn(
        "relative z-10 pl-0 md:pl-16 pt-16 md:pt-24 min-h-screen",
        isChatPage ? "pb-0 md:pb-0" : "pb-20 md:pb-0"
      )}>
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
