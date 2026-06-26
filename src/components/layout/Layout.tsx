import { useState } from 'react'
import { NavLink }   from 'react-router-dom'
import { Film, Menu, X } from 'lucide-react'
import {
  LayoutDashboard, Clock, Calculator, FileText, Receipt, Users, Settings,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useApp } from '@/context/AppContext'

// ── Icon Map ───────────────────────────────────────────────────────────────

const ICONS: Record<string, React.ElementType> = {
  'layout-dashboard': LayoutDashboard,
  'clock':            Clock,
  'calculator':       Calculator,
  'file-text':        FileText,
  'receipt':          Receipt,
  'users':            Users,
  'settings':         Settings,
}

// ── Nav Items ──────────────────────────────────────────────────────────────

const NAV = [
  { to: '/',            label: 'Dashboard',  icon: 'layout-dashboard' },
  { to: '/timesheets',  label: 'Timesheets', icon: 'clock'            },
  { to: '/calculator',  label: 'Calculator', icon: 'calculator'       },
  { to: '/quotes',      label: 'Quotes',     icon: 'file-text'        },
  { to: '/invoices',    label: 'Invoices',   icon: 'receipt'          },
  { to: '/profiles',    label: 'Profiles',   icon: 'users'            },
  { to: '/settings',    label: 'Settings',   icon: 'settings'         },
]

// ── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({ open, close }: { open: boolean; close: () => void }) {
  const { settings } = useApp()
  const initial = (settings.crewName || 'U').charAt(0).toUpperCase()

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={clsx(
          'fixed top-0 left-0 bottom-0 z-30 w-56 flex flex-col bg-slate-900',
          'transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow">
              <Film size={15} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-[14px] leading-tight">CrewQuote Pro</p>
              <p className="text-slate-500 text-[10px]">Film & TV Professionals</p>
            </div>
          </div>
          <button onClick={close} className="lg:hidden text-slate-400 hover:text-white p-1 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon }) => {
            const Icon = ICONS[icon]
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={close}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all w-full',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800',
                  )
                }
              >
                <Icon size={17} />
                {label}
              </NavLink>
            )
          })}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {settings.crewName || 'Your Name'}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {settings.role || 'Set role in Settings'}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar open={sidebarOpen} close={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-56">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 h-14 flex items-center gap-3 px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          {/* Future: global search, notifications */}
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
