import React, { useState } from 'react';
import {
  LayoutDashboard,
  UtensilsCrossed,
  BookOpen,
  ClipboardList,
  ChefHat,
  Receipt,
  BarChart3,
  Settings,
  LogOut,
  UserCheck,
  ChevronDown,
  Menu,
  X,
  Sparkles,
  Users,
  SlidersHorizontal,
  Cloud,
  CloudOff,
  RefreshCw,
} from 'lucide-react';
import { usePOS, AppView } from '../context/POSContext';
import { UserRole } from '../types/pos';
import { isOwner } from '../utils/security';

interface NavbarProps {
  onOpenSettings: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSettings }) => {
  const {
    currentUser,
    logout,
    activeView,
    setActiveView,
    hasPermission,
    quickLogin,
    tables,
    kots,
    orders,
    users,
    settings,
    syncStatus,
    syncError,
  } = usePOS();

  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!currentUser) return null;

  // Real-time metric badges
  const occupiedCount = tables.filter((t) => t.status === 'occupied').length;
  const activeKOTCount = kots.filter((k) => k.status === 'new' || k.status === 'preparing').length;
  const pendingBillCount = orders.filter((o) => o.status === 'active' && o.items.length > 0).length;

  const navItems: { id: AppView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'tables',
      label: 'Tables',
      icon: <UtensilsCrossed className="w-4 h-4" />,
      badge: occupiedCount > 0 ? occupiedCount : undefined,
    },
    { id: 'menu', label: 'Menu & Order', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'menu_management', label: 'Manage Menu', icon: <SlidersHorizontal className="w-4 h-4" /> },
    {
      id: 'orders',
      label: 'Orders',
      icon: <ClipboardList className="w-4 h-4" />,
      badge: pendingBillCount > 0 ? pendingBillCount : undefined,
    },
    {
      id: 'kitchen',
      label: 'Kitchen / KOT',
      icon: <ChefHat className="w-4 h-4" />,
      badge: activeKOTCount > 0 ? activeKOTCount : undefined,
    },
    { id: 'billing', label: 'Billing', icon: <Receipt className="w-4 h-4" /> },
    { id: 'reports', label: 'Daily Sales', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
  ];

  const allowedNavItems = navItems.filter((item) => hasPermission(item.id));

  const roleColors: Record<string, { bg: string; text: string; label: string }> = {
    owner: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Owner' },
    admin: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Owner' },
    manager: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Manager' },
    cashier: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Cashier' },
    waiter: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Waiter' },
    kitchen: { bg: 'bg-rose-100', text: 'text-rose-800', label: 'Kitchen Chef' },
  };

  const userRoleKey = isOwner(currentUser) ? 'owner' : String(currentUser.role || '').toLowerCase().trim();
  const currentRoleInfo = roleColors[userRoleKey] || roleColors.owner;

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-neutral-200 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Zone 1: Restaurant Logo and Name */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveView(currentUser.role === 'kitchen' ? 'kitchen' : 'dashboard')}
              className="text-left group flex items-center gap-3 focus:outline-none"
              title="Go to Home / Dashboard"
            >
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-black p-0.5 shadow-xs shrink-0 ring-1 ring-neutral-900/10 group-hover:scale-105 transition-transform flex items-center justify-center">
                <img
                  src={settings.logoUrl || '/logo.svg'}
                  alt={settings.name || 'Prime Century Restaurant Logo'}
                  className="w-full h-full object-contain rounded-lg"
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm sm:text-base font-bold tracking-tight text-neutral-900 group-hover:text-neutral-700 transition-colors truncate max-w-xs">
                  {settings.name || 'PRIMECENTURY RESTAURANT & CAFE'}
                </span>
                {settings.tagline && (
                  <span className="text-[10.5px] text-neutral-500 font-medium truncate hidden sm:block -mt-0.5">
                    {settings.tagline}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Zone 2: Navigation Links (single row, clean hover underline/tab states) */}
          <nav className="hidden lg:flex items-center gap-1">
            {allowedNavItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`relative flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
                        isActive
                          ? 'bg-white text-neutral-900'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1-2 primary actions & User Role selector */}
          <div className="flex items-center gap-2.5">
            {/* Live Cloud Multi-Device Sync Indicator */}
            <div
              className="hidden sm:flex items-center"
              title={syncError ? `Sync Error: ${syncError}` : 'Live Real-Time Cloud Synchronization active across all PCs and phones'}
            >
              {syncStatus === 'connected' ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50/90 text-emerald-800 text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-mono text-[10px] tracking-tight">Cloud Synced</span>
                </span>
              ) : syncStatus === 'syncing' ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-semibold">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                  <span className="font-mono text-[10px] tracking-tight">Syncing...</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-[11px] font-semibold">
                  <CloudOff className="w-3.5 h-3.5 text-rose-600" />
                  <span className="font-mono text-[10px] tracking-tight">Offline</span>
                </span>
              )}
            </div>

            {/* Authenticated User Badge & Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-neutral-200 hover:border-neutral-300 bg-neutral-50 hover:bg-neutral-100 transition-all text-xs cursor-pointer"
                title={`Logged in as ${currentUser.name} (${currentRoleInfo.label})`}
              >
                <span
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${currentRoleInfo.bg} ${currentRoleInfo.text}`}
                >
                  {currentRoleInfo.label}
                </span>
                <span className="font-medium text-neutral-800 hidden sm:inline truncate max-w-[120px]">
                  {currentUser.name}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
              </button>

              {roleMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setRoleMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-neutral-200 py-3 px-3 z-50 animate-in fade-in">
                    <div className="pb-2.5 border-b border-neutral-100">
                      <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                        Active Account
                      </div>
                      <div className="font-bold text-xs text-neutral-900 mt-1 truncate">
                        {currentUser.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 font-mono text-[11px] text-neutral-500">
                        <span>@{currentUser.username}</span>
                        <span>·</span>
                        <span className={`px-1.5 py-0.2 rounded font-semibold text-[10px] ${currentRoleInfo.bg} ${currentRoleInfo.text}`}>
                          {currentRoleInfo.label}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2.5 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRoleMenuOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer border border-rose-100"
                      >
                        <div className="flex items-center gap-2">
                          <LogOut className="w-3.5 h-3.5 text-rose-600" />
                          <span>Log Out</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Settings button (Strict Owner only) */}
            {isOwner(currentUser) && (
              <button
                onClick={onOpenSettings}
                className="p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                title="Restaurant & Tax Settings (Owner Only)"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* Direct Logout / Sign Out Button */}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors text-xs font-semibold cursor-pointer"
              title="Sign Out of POS"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-600" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>

            {/* Mobile / Tablet Menu Button */}
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="lg:hidden p-2 rounded-lg text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Dropdown Menu */}
        {mobileNavOpen && (
          <div className="lg:hidden py-3 border-t border-neutral-200 space-y-2">
            <div className="flex items-center gap-2.5 px-3 py-2 mb-1 bg-neutral-50 rounded-lg border border-neutral-100">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-black p-0.5 shrink-0">
                <img
                  src={settings.logoUrl || '/logo.svg'}
                  alt={settings.name || 'Prime Century'}
                  className="w-full h-full object-contain rounded-md"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-neutral-900 truncate">
                  {settings.name || 'PRIMECENTURY RESTAURANT & CAFE'}
                </p>
                <p className="text-[10px] text-neutral-500 truncate">
                  {settings.tagline || 'Fine Dining & Hospitality'}
                </p>
              </div>
            </div>
            {allowedNavItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveView(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        isActive ? 'bg-white text-neutral-900' : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Mobile Sign Out Button */}
            <div className="pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-600" />
                <span>Sign Out ({currentUser.name})</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
