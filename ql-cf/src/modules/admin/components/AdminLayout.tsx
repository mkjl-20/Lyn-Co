import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";

export function AdminLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#eef1ed]">
      <AdminSidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed((collapsed) => !collapsed)} />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
