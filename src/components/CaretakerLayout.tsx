import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Package, Users, LogOut, Menu, X } from 'lucide-react'

export default function CaretakerLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { signOut, user } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = async () => {
    await signOut()
    navigate('/caretaker/login')
  }

  const navItems = [
    { icon: Package, label: 'Inventory', path: '/caretaker/inventory' },
    { icon: Users, label: 'Tenant Onboarding', path: '/caretaker/tenants' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      {/* Mobile Header */}
      <header className="lg:hidden bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <h1 className="text-lg font-bold text-slate-900 dark:text-zinc-100">Caretaker Portal</h1>
          <button
            onClick={handleSignOut}
            className="p-2 text-slate-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div className="flex min-h-screen">
        {/* Mobile Sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`
            fixed lg:static inset-y-0 left-0 z-50
            w-64 bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800
            transform transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <div className="flex flex-col h-full">
            {/* Desktop Header */}
            <div className="hidden lg:flex items-center justify-between p-6 border-b border-slate-200 dark:border-zinc-800">
              <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100">Caretaker Portal</h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-xl transition-all
                      ${isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-semibold'
                        : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                      }
                    `}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>

            {/* User Info & Logout */}
            <div className="p-4 border-t border-slate-200 dark:border-zinc-800">
              <div className="mb-4 p-3 bg-slate-50 dark:bg-zinc-800 rounded-xl">
                <p className="text-xs text-slate-500 dark:text-zinc-400 mb-1">Signed in as</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">
                  {user?.email}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
              >
                <LogOut size={20} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:ml-0 min-h-screen overflow-hidden">
          <div className="p-4 lg:p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

