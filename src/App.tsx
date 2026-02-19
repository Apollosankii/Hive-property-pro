import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from '@/components/ToastProvider'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import Buildings from '@/pages/Buildings'
import Units from '@/pages/Units'
import Tenants from '@/pages/Tenants'
import Billing from '@/pages/Billing'
import Payments from '@/pages/Payments'
import Employees from '@/pages/Employees'
import Expenses from '@/pages/Expenses'
import Inventory from '@/pages/Inventory'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import SecurityDeposits from '@/pages/SecurityDeposits'
import TenantDetail from '@/pages/TenantDetail'
import Layout from '@/components/Layout'
import CaretakerLogin from '@/pages/CaretakerLogin'
import CaretakerLayout from '@/components/CaretakerLayout'
import CaretakerInventory from '@/pages/CaretakerInventory'
import CaretakerTenants from '@/pages/CaretakerTenants'

async function isCaretaker(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('caretakers')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()
    
    // If table doesn't exist or error, return false
    if (error) {
      // Table doesn't exist (42P01) or other errors
      if (error.code === '42P01' || error.code === 'PGRST116') {
        console.warn('Caretakers table does not exist. Please run CREATE_CARETAKERS_TABLE.sql')
        return false
      }
      console.error('Error checking caretaker status:', error)
      return false
    }
    
    return !!data
  } catch (err: any) {
    console.error('Error in isCaretaker:', err)
    return false
  }
}

function CaretakerRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  const [checking, setChecking] = useState(true)
  const [isCaretakerUser, setIsCaretakerUser] = useState(false)

  useEffect(() => {
    const checkCaretaker = async () => {
      if (user) {
        const caretaker = await isCaretaker(user.id)
        setIsCaretakerUser(caretaker)
      }
      setChecking(false)
    }
    checkCaretaker()
  }, [user])

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
            <div className="animate-spin rounded-full h-8 w-8 border-3 border-white border-t-transparent"></div>
          </div>
          <p className="text-slate-600 dark:text-zinc-400 font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/caretaker/login" />
  }

  if (!isCaretakerUser) {
    return <Navigate to="/" />
  }

  return <>{children}</>
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  const [checkingCaretaker, setCheckingCaretaker] = useState(true)
  const [isCaretakerUser, setIsCaretakerUser] = useState(false)

  useEffect(() => {
    const checkCaretakerStatus = async () => {
      if (user) {
        const caretaker = await isCaretaker(user.id)
        setIsCaretakerUser(caretaker)
      }
      setCheckingCaretaker(false)
    }
    if (!loading && user) {
      checkCaretakerStatus()
    } else if (!loading && !user) {
      setCheckingCaretaker(false)
    }
  }, [user, loading])
  
  if (loading || checkingCaretaker) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
            <div className="animate-spin rounded-full h-8 w-8 border-3 border-white border-t-transparent"></div>
          </div>
          <p className="text-slate-600 dark:text-zinc-400 font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  // Redirect caretakers to their portal
  if (isCaretakerUser) {
    return <Navigate to="/caretaker" replace />
  }
  
  return <>{children}</>
}


function App() {
  const { setUser, setLoading } = useAuthStore()
  const { isDark, setTheme } = useThemeStore()

  useEffect(() => {
    // Initialize theme
    setTheme(isDark)

    // Check active sessions
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [setUser, setLoading, isDark, setTheme])

  return (
    <ToastProvider>
      <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="buildings" element={<Buildings />} />
          <Route path="units" element={<Units />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="tenants/:id" element={<TenantDetail />} />
          <Route path="billing" element={<Billing />} />
          <Route path="payments" element={<Payments />} />
          <Route path="security-deposits" element={<SecurityDeposits />} />
          <Route path="employees" element={<Employees />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Caretaker Routes */}
        <Route path="/caretaker/login" element={<CaretakerLogin />} />
        <Route
          path="/caretaker"
          element={
            <CaretakerRoute>
              <CaretakerLayout>
                <Navigate to="/caretaker/inventory" replace />
              </CaretakerLayout>
            </CaretakerRoute>
          }
        />
        <Route
          path="/caretaker/inventory"
          element={
            <CaretakerRoute>
              <CaretakerLayout>
                <CaretakerInventory />
              </CaretakerLayout>
            </CaretakerRoute>
          }
        />
        <Route
          path="/caretaker/tenants"
          element={
            <CaretakerRoute>
              <CaretakerLayout>
                <CaretakerTenants />
              </CaretakerLayout>
            </CaretakerRoute>
          }
        />
      </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App

