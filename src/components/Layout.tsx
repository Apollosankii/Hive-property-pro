import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Building2, 
  Home, 
  Users, 
  Receipt, 
  CreditCard, 
  FileText, 
  Settings, 
  Menu, 
  X,
  LogOut,
  ChevronRight,
  Moon,
  Sun,
  Briefcase,
  Wallet,
  Package,
  Shield
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true) // Default to open on desktop
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut, user } = useAuthStore()
  const { isDark, toggleTheme } = useThemeStore()

  // Initialize theme on mount
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024
      if (desktop) {
        setSidebarOpen(true) // Auto-open on desktop
      } else {
        setSidebarOpen(false) // Auto-close on mobile
      }
    }
    handleResize() // Set initial state
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Building2, label: 'Buildings', path: '/buildings' },
    { icon: Home, label: 'Units', path: '/units' },
    { icon: Users, label: 'Tenants', path: '/tenants' },
    { icon: Receipt, label: 'Billing', path: '/billing' },
    { icon: CreditCard, label: 'Payments', path: '/payments' },
    { icon: Shield, label: 'Security Deposits', path: '/security-deposits' },
    { icon: Briefcase, label: 'Employees', path: '/employees', title: 'Employees (including caretakers)' },
    { icon: Wallet, label: 'Expenses', path: '/expenses' },
    { icon: Package, label: 'Inventory', path: '/inventory' },
    { icon: FileText, label: 'Reports', path: '/reports' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ]

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-slate-200/80 dark:border-zinc-900/80 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-700 rounded-lg flex items-center justify-center">
            <Building2 className="text-white" size={18} />
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">
            PropManager
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={20} className="text-amber-500" /> : <Moon size={20} className="text-slate-600" />}
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:fixed inset-y-0 left-0 z-50
          ${sidebarOpen ? 'w-72' : 'w-0 lg:w-20'} bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-r border-slate-200/80 dark:border-zinc-900/80
          transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          transition-all duration-300 ease-out
          flex flex-col
          h-screen
          overflow-hidden
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200/80 dark:border-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/30">
              <Building2 className="text-white" size={22} />
            </div>
            <div className={sidebarOpen ? 'block' : 'hidden lg:block'}>
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">
                PropManager
              </h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Property Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sidebarOpen && (
              <button
                onClick={toggleTheme}
                className="hidden lg:flex p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-slate-600 dark:text-slate-400" />}
              </button>
            )}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => {
                  if (window.innerWidth < 1024) {
                    setSidebarOpen(false)
                  }
                }}
                className={({ isActive }) =>
                  `sidebar-link ${
                    isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'
                  } ${!sidebarOpen ? 'justify-center' : ''}`
                }
                title={!sidebarOpen ? (item.title || item.label) : (item.title || '')}
              >
                <Icon size={20} className="flex-shrink-0" />
                {sidebarOpen && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight 
                      size={16} 
                      className={`flex-shrink-0 transition-transform duration-200 ${
                        location.pathname === item.path ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0'
                      }`}
                    />
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User section */}
        <div className={`p-4 border-t border-slate-200/80 dark:border-zinc-900/80 bg-gradient-to-b from-slate-50/50 dark:from-zinc-950/50 to-transparent ${!sidebarOpen ? 'px-2' : ''}`}>
          {sidebarOpen && (
            <div className="mb-3 px-4 py-2.5 bg-slate-100/50 dark:bg-zinc-900/50 rounded-xl">
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Signed in as</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200 truncate">{user?.email}</p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className={`w-full sidebar-link sidebar-link-inactive text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 ${!sidebarOpen ? 'justify-center' : ''}`}
            title={!sidebarOpen ? 'Sign Out' : ''}
          >
            <LogOut size={20} />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Desktop toggle button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-r-xl p-2 shadow-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all duration-300"
        style={{ left: sidebarOpen ? '288px' : '80px', transform: 'translateY(-50%)' }}
        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <ChevronRight size={20} className={sidebarOpen ? 'rotate-180' : ''} />
      </button>

      {/* Main content */}
      <main className={`flex-1 pt-16 lg:pt-0 min-h-screen flex flex-col overflow-hidden ${sidebarOpen ? 'lg:ml-72' : 'lg:ml-20'} transition-all duration-300`}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 lg:p-6 max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}

