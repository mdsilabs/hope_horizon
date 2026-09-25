"use client";

import { useState } from "react";
import { Bell, ChevronDown, LogOut, Menu, User } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Topbar({
  userName,
  roleLabel,
  unreadCount = 0,
  onLogout,
  onMenuToggle,
}: {
  userName: string;
  roleLabel: string;
  unreadCount?: number;
  onLogout?: () => void;
  onMenuToggle?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-16 items-center justify-between border-b border-surface-border bg-white px-4 md:px-6">
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-2 text-slate-500 hover:bg-surface-muted md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden md:block" />
      <div className="flex items-center gap-4">
        <button
          className="relative rounded-lg p-2 text-slate-500 hover:bg-surface-muted focus-ring"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-muted focus-ring"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <User className="h-4 w-4" />
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium leading-tight text-slate-800">{userName}</p>
              <p className="text-xs leading-tight text-slate-500">{roleLabel}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          <div
            className={cn(
              "absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border border-surface-border bg-white p-1.5 shadow-popover",
              menuOpen ? "block" : "hidden"
            )}
          >
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-surface-muted"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
