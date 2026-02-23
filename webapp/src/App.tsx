import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Clock3,
  CreditCard,
  Hotel,
  LogOut,
  ReceiptText,
  Shield,
  Users,
} from 'lucide-react'
import { LoginExperience } from '@/features/auth/LoginExperience'
import { CheckoutWorkspace } from '@/features/checkout/CheckoutWorkspace'
import { MenuManagement } from '@/features/menu/MenuManagement'
import { PosWorkspace } from '@/features/pos/PosWorkspace'
import { isSupabaseConfigured, db } from '@/lib/supabase'
import { applyRuntimeTranslation } from '@/lib/runtime-translate'
import type { Locale, StaffRole, StaffUser, StayListItem } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type TabKey = 'checkout' | 'pos' | 'stays' | 'menu' | 'reports'

type ToastState = {
  message: string
  type: 'success' | 'error'
} | null

type OutletReportRow = {
  outlet_name: string
  orders: number
  revenue: number
}

type PaymentMethodReportRow = {
  method: string
  total: number
  count: number
}

type HourlyReportRow = {
  hour: number
  orders: number
  revenue: number
}

type DebtorRow = {
  stay_id: number
  room_number: string
  guest_name: string
  balance: number
}

type ClosedStayRow = {
  stay_id: number
  room_number: string
  guest_name: string
  closed_at: string
}

type RoomRow = {
  id: number
  room_number: string
  is_active: boolean
}

const SESSION_KEY = 'hotel_pos_react_session_v1'
const LOCALE_KEY = 'hotel_pos_locale_v1'

const TAB_ACCESS: Record<StaffRole, TabKey[]> = {
  resepsiyon: ['stays', 'checkout', 'reports'],
  servis: ['pos', 'menu', 'reports'],
  admin: ['stays', 'checkout', 'pos', 'menu', 'reports'],
}

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} TL`
}

function dateTime(value: string, locale: Locale) {
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'tr-TR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('checkout')
  const [toast, setToast] = useState<ToastState>(null)
  const [locale, setLocale] = useState<Locale>(() => {
    const raw = localStorage.getItem(LOCALE_KEY)
    return raw === 'en' ? 'en' : 'tr'
  })

  const [openStays, setOpenStays] = useState<StayListItem[]>([])
  const [staysFilter, setStaysFilter] = useState('')
  const [recentOrders, setRecentOrders] = useState<
    Array<{
      id: number
      created_at: string
      outlet_name: string
      room_number: string
      total: number
    }>
  >([])
  const [reportSummary, setReportSummary] = useState({
    todayOrders: 0,
    todayRevenue: 0,
    openStayCount: 0,
    openBalance: 0,
  })
  const [reportDetails, setReportDetails] = useState({
    avgTicket: 0,
    todayPayments: 0,
    todayPaymentCount: 0,
    topOutlets: [] as OutletReportRow[],
    paymentByMethod: [] as PaymentMethodReportRow[],
    hourlyLoad: [] as HourlyReportRow[],
    topDebtors: [] as DebtorRow[],
    recentClosures: [] as ClosedStayRow[],
  })

  const [isLoadingPanels, setIsLoadingPanels] = useState(false)
  const [roomOptions, setRoomOptions] = useState<RoomRow[]>([])
  const [availableRooms, setAvailableRooms] = useState<RoomRow[]>([])
  const [checkinGuestName, setCheckinGuestName] = useState('')
  const [checkinGuestPhone, setCheckinGuestPhone] = useState('')
  const [checkinRoomNumber, setCheckinRoomNumber] = useState('')
  const [checkinPlan, setCheckinPlan] = useState('')
  const [checkinNote, setCheckinNote] = useState('')
  const [isCreatingCheckin, setIsCreatingCheckin] = useState(false)

  function t(tr: string, en: string) {
    return locale === 'en' ? en : tr
  }

  function paymentMethodLabel(value: string) {
    if (value === 'nakit') return t('Nakit', 'Cash')
    if (value === 'kart') return t('Kart', 'Card')
    if (value === 'havale') return t('Havale / EFT', 'Wire / EFT')
    if (value === 'diger') return t('Diger', 'Other')
    return value
  }

  const allowedTabs = useMemo(() => {
    if (!currentUser) return []
    return TAB_ACCESS[currentUser.role]
  }, [currentUser])

  const filteredStays = useMemo(() => {
    const q = staysFilter.trim().toLowerCase()
    if (!q) return openStays

    return openStays.filter((stay) => {
      const room = stay.room?.room_number?.toLowerCase() || ''
      const guest = stay.guest?.full_name?.toLowerCase() || ''
      return room.includes(q) || guest.includes(q)
    })
  }, [openStays, staysFilter])

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 2600)
  }

  function changeLocale(next: Locale) {
    setLocale(next)
    localStorage.setItem(LOCALE_KEY, next)
  }

  function getSession(): { id: number } | null {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null

    try {
      return JSON.parse(raw) as { id: number }
    } catch {
      return null
    }
  }

  async function restoreSession() {
    const session = getSession()
    if (!session?.id) return

    const res = await db
      .from('staff_users')
      .select('id,username,display_name,role,is_active')
      .eq('id', session.id)
      .eq('is_active', true)
      .maybeSingle()

    if (res.error || !res.data) {
      localStorage.removeItem(SESSION_KEY)
      return
    }

    const user = res.data as StaffUser
    setCurrentUser(user)
    setActiveTab(TAB_ACCESS[user.role][0])
  }

  async function loadPanels() {
    setIsLoadingPanels(true)

    try {
      const staysRes = await db
        .from('stays')
        .select(
          'id,check_in,check_out_plan,room:rooms!stays_room_id_fkey(id,room_number),guest:guests!stays_guest_id_fkey(id,full_name,phone)',
        )
        .eq('status', 'open')
        .order('check_in', { ascending: false })

      if (staysRes.error) {
        throw new Error(staysRes.error.message)
      }

      const rawStays = (staysRes.data || []) as Array<{
        id: number
        check_in: string
        check_out_plan: string | null
        room: { id: number; room_number: string } | { id: number; room_number: string }[] | null
        guest:
        | { id: number; full_name: string; phone: string | null }
        | { id: number; full_name: string; phone: string | null }[]
        | null
      }>

      const baseStays: Omit<StayListItem, 'balance'>[] = rawStays.map((stay) => ({
        id: stay.id,
        check_in: stay.check_in,
        check_out_plan: stay.check_out_plan,
        room: pickOne(stay.room),
        guest: pickOne(stay.guest),
      }))
      const stayIds = baseStays.map((stay) => stay.id)

      const balancesRes = await db
        .from('v_stay_balance')
        .select('stay_id,balance,status')
        .eq('status', 'open')
        .in('stay_id', stayIds.length ? stayIds : [-1])

      if (balancesRes.error) {
        throw new Error(balancesRes.error.message)
      }

      const balanceMap = new Map(
        (balancesRes.data || []).map((row: { stay_id: number; balance: number }) => [
          row.stay_id,
          Number(row.balance || 0),
        ]),
      )

      const preparedStays = baseStays.map((stay) => ({
        ...stay,
        balance: balanceMap.get(stay.id) || 0,
      }))

      const ordersRes = await db
        .from('orders')
        .select('id,created_at,stay_id,outlet_id')
        .order('created_at', { ascending: false })
        .limit(40)

      if (ordersRes.error) {
        throw new Error(ordersRes.error.message)
      }

      const orders = ordersRes.data || []
      const orderIds = orders.map((order) => order.id)
      const orderStayIds = orders.map((order) => order.stay_id).filter(Boolean) as number[]

      const [totalsRes, outletsRes, orderRoomsRes, allRoomsRes] = await Promise.all([
        db
          .from('v_order_totals')
          .select('order_id,total')
          .in('order_id', orderIds.length ? orderIds : [-1]),
        db.from('outlets').select('id,name'),
        db
          .from('stays')
          .select('id,room:rooms!stays_room_id_fkey(room_number)')
          .in('id', orderStayIds.length ? orderStayIds : [-1]),
        db.from('rooms').select('id,room_number,is_active').eq('is_active', true).order('room_number'),
      ])

      if (totalsRes.error || outletsRes.error || orderRoomsRes.error || allRoomsRes.error) {
        throw new Error(
          totalsRes.error?.message ||
          outletsRes.error?.message ||
          orderRoomsRes.error?.message ||
          allRoomsRes.error?.message ||
          t('Veri alinamadi', 'Unable to fetch data'),
        )
      }

      const totalMap = new Map(
        (totalsRes.data || []).map((row: { order_id: number; total: number }) => [
          row.order_id,
          Number(row.total || 0),
        ]),
      )

      const outletMap = new Map(
        (outletsRes.data || []).map((outlet: { id: number; name: string }) => [outlet.id, outlet.name]),
      )

      const roomMap = new Map(
        (orderRoomsRes.data || []).map((row: { id: number; room: { room_number: string }[] | null }) => [
          row.id,
          pickOne(row.room)?.room_number || '-',
        ]),
      )

      const preparedOrders = orders.map((order) => ({
        id: Number(order.id),
        created_at: String(order.created_at),
        outlet_name: outletMap.get(Number(order.outlet_id)) || '-',
        room_number: order.stay_id ? roomMap.get(Number(order.stay_id)) || '-' : t('Yuruyen', 'Walk-in'),
        total: totalMap.get(Number(order.id)) || 0,
      }))

      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString()

      const [todayOrdersRes, todayPaymentsRes, todayClosedRes] = await Promise.all([
        db
          .from('orders')
          .select('id,created_at,outlet_id')
          .gte('created_at', start)
          .lte('created_at', end),
        db
          .from('payments')
          .select('method,amount,entry_type,created_at')
          .gte('created_at', start)
          .lte('created_at', end),
        db
          .from('stays')
          .select(
            'id,closed_at,room:rooms!stays_room_id_fkey(room_number),guest:guests!stays_guest_id_fkey(full_name)',
          )
          .eq('status', 'closed')
          .gte('closed_at', start)
          .lte('closed_at', end)
          .order('closed_at', { ascending: false })
          .limit(10),
      ])

      if (todayOrdersRes.error || todayPaymentsRes.error || todayClosedRes.error) {
        throw new Error(
          todayOrdersRes.error?.message ||
          todayPaymentsRes.error?.message ||
          todayClosedRes.error?.message ||
          t('Rapor verisi alinamadi', 'Unable to fetch report data'),
        )
      }

      const todayOrderRows = (todayOrdersRes.data || []) as Array<{
        id: number
        created_at: string
        outlet_id: number
      }>
      const todayOrderIds = todayOrderRows.map((order) => order.id)

      const todayTotalsRes = await db
        .from('v_order_totals')
        .select('order_id,total')
        .in('order_id', todayOrderIds.length ? todayOrderIds : [-1])

      if (todayTotalsRes.error) {
        throw new Error(todayTotalsRes.error.message)
      }

      const todayTotalMap = new Map(
        (todayTotalsRes.data || []).map((row: { order_id: number; total: number }) => [
          row.order_id,
          Number(row.total || 0),
        ]),
      )

      const todayOrders = todayOrderRows.map((order) => ({
        ...order,
        total: todayTotalMap.get(order.id) || 0,
      }))

      const todayRevenue = todayOrders.reduce((sum, order) => sum + order.total, 0)
      const avgTicket = todayOrders.length ? todayRevenue / todayOrders.length : 0

      const outletAgg = new Map<number, { orders: number; revenue: number }>()
      todayOrders.forEach((order) => {
        const prev = outletAgg.get(order.outlet_id) || { orders: 0, revenue: 0 }
        outletAgg.set(order.outlet_id, {
          orders: prev.orders + 1,
          revenue: prev.revenue + order.total,
        })
      })

      const topOutlets: OutletReportRow[] = Array.from(outletAgg.entries())
        .map(([outletId, data]) => ({
          outlet_name: outletMap.get(outletId) || '-',
          orders: data.orders,
          revenue: data.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)

      const paymentRows = (todayPaymentsRes.data || []) as Array<{
        method: string
        amount: number
        entry_type: string | null
        created_at: string
      }>

      const paymentAgg = new Map<string, { total: number; count: number }>()
      paymentRows.forEach((payment) => {
        const method = payment.method || 'diger'
        const prev = paymentAgg.get(method) || { total: 0, count: 0 }
        const amount = Number(payment.amount || 0)
        paymentAgg.set(method, {
          total: prev.total + amount,
          count: prev.count + (amount > 0 ? 1 : 0),
        })
      })

      const paymentByMethod: PaymentMethodReportRow[] = Array.from(paymentAgg.entries())
        .map(([method, data]) => ({
          method,
          total: data.total,
          count: data.count,
        }))
        .sort((a, b) => b.total - a.total)

      const hourly = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        orders: 0,
        revenue: 0,
      }))

      todayOrders.forEach((order) => {
        const hour = new Date(order.created_at).getHours()
        hourly[hour].orders += 1
        hourly[hour].revenue += order.total
      })

      const topDebtors: DebtorRow[] = preparedStays
        .filter((stay) => stay.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 8)
        .map((stay) => ({
          stay_id: stay.id,
          room_number: stay.room?.room_number || '-',
          guest_name: stay.guest?.full_name || '-',
          balance: stay.balance,
        }))

      const closedRows = (todayClosedRes.data || []) as Array<{
        id: number
        closed_at: string
        room: { room_number: string } | { room_number: string }[] | null
        guest: { full_name: string } | { full_name: string }[] | null
      }>

      const recentClosures: ClosedStayRow[] = closedRows.map((row) => ({
        stay_id: row.id,
        room_number: pickOne(row.room)?.room_number || '-',
        guest_name: pickOne(row.guest)?.full_name || '-',
        closed_at: String(row.closed_at),
      }))

      const openBalance = preparedStays.reduce((sum, stay) => sum + stay.balance, 0)
      const todayPayments = paymentRows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
      const activeRooms = (allRoomsRes.data || []) as RoomRow[]
      const occupiedRoomIds = new Set(
        preparedStays.map((stay) => stay.room?.id).filter(Boolean) as number[],
      )
      const freeRooms = activeRooms.filter((room) => !occupiedRoomIds.has(room.id))

      setOpenStays(preparedStays)
      setRoomOptions(activeRooms)
      setAvailableRooms(freeRooms)
      setCheckinRoomNumber((prev) => {
        if (!prev.trim()) {
          return freeRooms[0]?.room_number || ''
        }
        return prev
      })
      setRecentOrders(preparedOrders)
      setReportSummary({
        todayOrders: todayOrders.length,
        todayRevenue,
        openStayCount: preparedStays.length,
        openBalance,
      })
      setReportDetails({
        avgTicket,
        todayPayments,
        todayPaymentCount: paymentRows.filter((payment) => Number(payment.amount || 0) > 0).length,
        topOutlets,
        paymentByMethod,
        hourlyLoad: hourly.filter((item) => item.orders > 0 || item.revenue > 0),
        topDebtors,
        recentClosures,
      })
    } finally {
      setIsLoadingPanels(false)
    }
  }

  async function createCheckin() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'resepsiyon')) {
      showToast(t('Bu islem icin yetkiniz yok.', 'You are not authorized for this action.'), 'error')
      return
    }

    const guestName = checkinGuestName.trim()
    if (!guestName) {
      showToast(t('Misafir adi zorunlu.', 'Guest name is required.'), 'error')
      return
    }

    const roomNumber = checkinRoomNumber.trim()
    if (!roomNumber) {
      showToast(t('Oda numarasi zorunlu.', 'Room number is required.'), 'error')
      return
    }

    setIsCreatingCheckin(true)

    try {
      let targetRoom = roomOptions.find(
        (room) => room.room_number.toLowerCase() === roomNumber.toLowerCase(),
      )

      if (!targetRoom) {
        const roomLookupRes = await db
          .from('rooms')
          .select('id,room_number,is_active')
          .ilike('room_number', roomNumber)
          .limit(1)
          .maybeSingle()

        if (roomLookupRes.error) {
          throw new Error(roomLookupRes.error.message)
        }

        if (roomLookupRes.data) {
          targetRoom = roomLookupRes.data as RoomRow

          if (!targetRoom.is_active) {
            const roomActivateRes = await db
              .from('rooms')
              .update({ is_active: true })
              .eq('id', targetRoom.id)
            if (roomActivateRes.error) throw new Error(roomActivateRes.error.message)
          }
        }
      }

      if (!targetRoom) {
        const createRoomRes = await db
          .from('rooms')
          .insert({ room_number: roomNumber, is_active: true })
          .select('id,room_number,is_active')
          .single()

        if (createRoomRes.error || !createRoomRes.data) {
          throw new Error(createRoomRes.error?.message || t('Oda olusturulamadi.', 'Room could not be created.'))
        }

        targetRoom = createRoomRes.data as RoomRow
      }

      if (openStays.some((stay) => stay.room?.id === targetRoom.id)) {
        showToast(t('Secilen oda su an dolu.', 'Selected room is currently occupied.'), 'error')
        setIsCreatingCheckin(false)
        return
      }

      const guestRes = await db
        .from('guests')
        .insert({
          full_name: guestName,
          phone: checkinGuestPhone.trim() || null,
        })
        .select('id')
        .single()

      if (guestRes.error || !guestRes.data) {
        throw new Error(guestRes.error?.message || t('Misafir kaydi olusturulamadi.', 'Guest record could not be created.'))
      }

      const plannedIso = checkinPlan ? new Date(checkinPlan).toISOString() : null
      const stayRes = await db.from('stays').insert({
        guest_id: Number(guestRes.data.id),
        room_id: Number(targetRoom.id),
        check_out_plan: plannedIso,
        note: checkinNote.trim() || null,
        status: 'open',
      })

      if (stayRes.error) {
        throw new Error(stayRes.error.message)
      }

      setCheckinGuestName('')
      setCheckinGuestPhone('')
      setCheckinRoomNumber('')
      setCheckinPlan('')
      setCheckinNote('')

      await loadPanels()
      showToast(t('Yeni konaklama acildi.', 'New stay created.'), 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : t('Islem basarisiz.', 'Operation failed.')
      showToast(message, 'error')
    } finally {
      setIsCreatingCheckin(false)
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return
    restoreSession().catch((err: Error) => showToast(err.message, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'tr'
  }, [locale])

  useEffect(() => {
    const root = document.body
    let applying = false

    const run = () => {
      if (applying) return
      applying = true
      applyRuntimeTranslation(root, locale)
      applying = false
    }

    run()

    const observer = new MutationObserver(() => {
      run()
    })

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title'],
    })

    return () => observer.disconnect()
  }, [locale, currentUser, activeTab])

  useEffect(() => {
    if (!currentUser) return

    const firstAllowed = TAB_ACCESS[currentUser.role][0]
    if (!TAB_ACCESS[currentUser.role].includes(activeTab)) {
      setActiveTab(firstAllowed)
    }

    loadPanels().catch((err: Error) => showToast(err.message, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, locale])

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Supabase config eksik</CardTitle>
            <CardDescription>
              {t(
                '`VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` degerlerini ayarlayin.',
                'Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values.',
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <>
        <LoginExperience
          locale={locale}
          onLocaleChange={changeLocale}
          onAuthenticated={(user) => {
            setCurrentUser(user)
            localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id }))
            setActiveTab(TAB_ACCESS[user.role][0])
            showToast(
              locale === 'en' ? `Welcome ${user.display_name}` : `Hos geldin ${user.display_name}`,
              'success',
            )
          }}
        />
        {toast && (
          <div
            className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white ${toast.type === 'error' ? 'bg-rose-600' : 'bg-teal-700'
              }`}
          >
            {toast.message}
          </div>
        )}
      </>
    )
  }

  return (
    <div className="h-[100svh] overflow-hidden bg-[radial-gradient(circle_at_top_left,_#dcfce7,_transparent_30%),radial-gradient(circle_at_top_right,_#e0f2fe,_transparent_24%),#f8fafc] px-4 py-4 md:px-8 md:py-6">
      <div className="mx-auto flex h-full max-w-[1600px] min-h-0 flex-col gap-5">
        <Card className="border-none bg-slate-900 text-white">
          <CardContent className="flex flex-col gap-4 pt-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Hotel className="h-5 w-5 text-emerald-300" />
                <h1 className="font-[Space_Grotesk] text-2xl font-bold">Hotel POS Control</h1>
              </div>
              <p className="text-sm text-slate-300">
                {t(
                  'Rol bazli operasyon paneli - login ve checkout UX optimize edildi.',
                  'Role-based operations panel - login and checkout UX optimized.',
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-lg border border-white/20 p-1">
                <Button
                  size="sm"
                  variant={locale === 'tr' ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => changeLocale('tr')}
                >
                  TR
                </Button>
                <Button
                  size="sm"
                  variant={locale === 'en' ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => changeLocale('en')}
                >
                  EN
                </Button>
              </div>
              <Badge variant="neutral" className="bg-white/10 text-white">
                {currentUser.display_name} ({currentUser.role})
              </Badge>
              <Button
                variant="outline"
                className="border-white/30 bg-transparent text-white hover:bg-white/10"
                onClick={() => {
                  localStorage.removeItem(SESSION_KEY)
                  setCurrentUser(null)
                  showToast(t('Oturum kapatildi.', 'Session closed.'), 'success')
                }}
              >
                <LogOut className="h-4 w-4" />
                {t('Cikis', 'Logout')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabKey)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="shrink-0 md:grid-cols-5">
            {allowedTabs.includes('stays') && <TabsTrigger value="stays">{t('Konaklamalar', 'Stays')}</TabsTrigger>}
            {allowedTabs.includes('checkout') && (
              <TabsTrigger value="checkout">{t('Checkout', 'Checkout')}</TabsTrigger>
            )}
            {allowedTabs.includes('pos') && <TabsTrigger value="pos">POS</TabsTrigger>}
            {allowedTabs.includes('menu') && <TabsTrigger value="menu">{t('Menu', 'Menu')}</TabsTrigger>}
            {allowedTabs.includes('reports') && <TabsTrigger value="reports">{t('Raporlar', 'Reports')}</TabsTrigger>}
          </TabsList>

          {allowedTabs.includes('checkout') && (
            <TabsContent value="checkout" className="mt-4 min-h-0 flex-1 overflow-auto lg:overflow-hidden">
              <CheckoutWorkspace
                currentUser={currentUser}
                locale={locale}
                onToast={(message, type = 'success') => {
                  showToast(message, type)
                  loadPanels().catch((err: Error) => showToast(err.message, 'error'))
                }}
                onDataChanged={() => {
                  loadPanels().catch((err: Error) => showToast(err.message, 'error'))
                }}
              />
            </TabsContent>
          )}

          {allowedTabs.includes('pos') && (
            <TabsContent value="pos" className="mt-4 min-h-0 flex-1 overflow-auto">
              <PosWorkspace
                currentUser={currentUser}
                locale={locale}
                onToast={(message, type = 'success') => {
                  showToast(message, type)
                }}
                onDataChanged={() => {
                  loadPanels().catch((err: Error) => showToast(err.message, 'error'))
                }}
              />
            </TabsContent>
          )}

          {allowedTabs.includes('stays') && (
            <TabsContent value="stays" className="mt-4 min-h-0 flex-1 overflow-auto xl:overflow-hidden">
              <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
                {(currentUser.role === 'admin' || currentUser.role === 'resepsiyon') && (
                  <Card className="min-h-0 overflow-hidden">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Hotel className="h-5 w-5 text-teal-700" />
                        {t('Yeni musteri girisi', 'New customer check-in')}
                      </CardTitle>
                      <CardDescription>
                        {t('Yalnizca admin ve resepsiyon oda girisi yapabilir.', 'Only admin and reception can create check-ins.')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="max-h-full space-y-3 overflow-auto pr-1">
                      <div>
                        <Label className="mb-1 block">{t('Misafir Ad Soyad', 'Guest full name')}</Label>
                        <Input
                          value={checkinGuestName}
                          onChange={(e) => setCheckinGuestName(e.target.value)}
                          placeholder={t('Orn: Ahmet Yilmaz', 'Ex: John Smith')}
                          disabled={isCreatingCheckin}
                        />
                      </div>
                      <div>
                        <Label className="mb-1 block">{t('Telefon (opsiyonel)', 'Phone (optional)')}</Label>
                        <Input
                          value={checkinGuestPhone}
                          onChange={(e) => setCheckinGuestPhone(e.target.value)}
                          placeholder={t('Orn: 0555 000 00 00', 'Ex: +1 555 000 00 00')}
                          disabled={isCreatingCheckin}
                        />
                      </div>
                      <div>
                        <Label className="mb-1 block">{t('Oda numarasi', 'Room number')}</Label>
                        <Input
                          value={checkinRoomNumber}
                          onChange={(e) => setCheckinRoomNumber(e.target.value)}
                          list="room-number-suggestions"
                          placeholder={t('Orn: 204', 'Ex: 204')}
                          disabled={isCreatingCheckin}
                        />
                        <datalist id="room-number-suggestions">
                          {availableRooms.map((room) => (
                            <option key={room.id} value={room.room_number} />
                          ))}
                        </datalist>
                        <p className="mt-1 text-xs text-slate-500">
                          {t(
                            'Dolu odalar check-in sirasinda otomatik engellenir. Oda yoksa yeni oda numarasi yazabilirsiniz.',
                            'Occupied rooms are blocked at save time. You can also type a new room number.',
                          )}
                        </p>
                      </div>
                      <div>
                        <Label className="mb-1 block">{t('Planli cikis', 'Planned check-out')}</Label>
                        <Input
                          type="datetime-local"
                          value={checkinPlan}
                          onChange={(e) => setCheckinPlan(e.target.value)}
                          disabled={isCreatingCheckin}
                        />
                      </div>
                      <div>
                        <Label className="mb-1 block">{t('Not (opsiyonel)', 'Note (optional)')}</Label>
                        <Textarea
                          value={checkinNote}
                          onChange={(e) => setCheckinNote(e.target.value)}
                          placeholder={t('Orn: Gece gec check-in', 'Ex: Late-night check-in')}
                          className="min-h-[80px]"
                          disabled={isCreatingCheckin}
                        />
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {t('Musait oda sayisi', 'Available room count')}: {availableRooms.length}
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => {
                          void createCheckin()
                        }}
                        disabled={isCreatingCheckin}
                      >
                        {isCreatingCheckin ? t('Kaydediliyor...', 'Saving...') : t('Konaklama Ac', 'Create stay')}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                <Card className="flex min-h-0 flex-col overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-teal-700" />
                      {t('Acik konaklamalar', 'Open stays')}
                    </CardTitle>
                    <CardDescription>{t('Resepsiyon icin hizli room/guest tarama paneli.', 'Fast room/guest lookup for reception.')}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col space-y-3">
                    <Input
                      value={staysFilter}
                      onChange={(e) => setStaysFilter(e.target.value)}
                      placeholder={t('Oda no veya misafir ara...', 'Search room number or guest...')}
                    />
                    <div className="grid min-h-0 flex-1 gap-2 overflow-auto pr-1 md:grid-cols-2">
                      {filteredStays.map((stay) => (
                        <div key={stay.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-1 flex items-center justify-between">
                            <div className="font-semibold text-slate-900">
                              {t('Oda', 'Room')} {stay.room?.room_number || '-'}
                            </div>
                            <Badge variant={stay.balance > 0 ? 'danger' : 'success'}>
                              {stay.balance > 0 ? money(stay.balance) : t('Odendi', 'Paid')}
                            </Badge>
                          </div>
                          <div className="text-sm text-slate-700">{stay.guest?.full_name || '-'}</div>
                          <div className="text-xs text-slate-500">{dateTime(stay.check_in, locale)}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          {allowedTabs.includes('menu') && (
            <TabsContent value="menu" className="mt-4 min-h-0 flex-1 overflow-auto">
              <MenuManagement
                locale={locale}
                onToast={(message, type = 'success') => {
                  showToast(message, type)
                  loadPanels().catch((err: Error) => showToast(err.message, 'error'))
                }}
              />
            </TabsContent>
          )}

          {allowedTabs.includes('reports') && (
            <TabsContent value="reports" className="mt-4 min-h-0 flex-1 overflow-auto">
              <div className="space-y-5">
                {/* ── KPI Dashboard Header ── */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-[Space_Grotesk] text-xl font-bold text-slate-900">
                      {t('Günlük Dashboard', 'Daily Dashboard')}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => loadPanels().catch((err: Error) => showToast(err.message, 'error'))}
                    disabled={isLoadingPanels}
                    className="gap-2"
                  >
                    <Clock3 className="h-4 w-4" />
                    {isLoadingPanels ? t('Yenileniyor...', 'Refreshing...') : t('Yenile', 'Refresh')}
                  </Button>
                </div>

                {/* ── KPI Summary Cards ── */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                  <Card className="border-none bg-gradient-to-br from-blue-50 to-blue-100/60 shadow-sm">
                    <CardContent className="px-4 py-3">
                      <div className="mb-1 flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                          <ReceiptText className="h-4 w-4 text-blue-600" />
                        </div>
                      </div>
                      <div className="font-[Space_Grotesk] text-2xl font-bold text-slate-900">{reportSummary.todayOrders}</div>
                      <div className="text-xs text-slate-500">{t('Sipariş', 'Orders')}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-none bg-gradient-to-br from-emerald-50 to-emerald-100/60 shadow-sm">
                    <CardContent className="px-4 py-3">
                      <div className="mb-1 flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                          <CreditCard className="h-4 w-4 text-emerald-600" />
                        </div>
                      </div>
                      <div className="font-[Space_Grotesk] text-2xl font-bold text-slate-900">{money(reportSummary.todayRevenue)}</div>
                      <div className="text-xs text-slate-500">{t('Ciro', 'Revenue')}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-none bg-gradient-to-br from-violet-50 to-violet-100/60 shadow-sm">
                    <CardContent className="px-4 py-3">
                      <div className="mb-1 flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                          <ReceiptText className="h-4 w-4 text-violet-600" />
                        </div>
                      </div>
                      <div className="font-[Space_Grotesk] text-2xl font-bold text-slate-900">{money(reportDetails.avgTicket)}</div>
                      <div className="text-xs text-slate-500">{t('Ort. Adisyon', 'Avg Ticket')}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-none bg-gradient-to-br from-amber-50 to-amber-100/60 shadow-sm">
                    <CardContent className="px-4 py-3">
                      <div className="mb-1 flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                          <CreditCard className="h-4 w-4 text-amber-600" />
                        </div>
                      </div>
                      <div className="font-[Space_Grotesk] text-2xl font-bold text-slate-900">{money(reportDetails.todayPayments)}</div>
                      <div className="text-xs text-slate-500">{t('Tahsilat', 'Collections')}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-none bg-gradient-to-br from-teal-50 to-teal-100/60 shadow-sm">
                    <CardContent className="px-4 py-3">
                      <div className="mb-1 flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/10">
                          <Users className="h-4 w-4 text-teal-600" />
                        </div>
                      </div>
                      <div className="font-[Space_Grotesk] text-2xl font-bold text-slate-900">{reportSummary.openStayCount}</div>
                      <div className="text-xs text-slate-500">{t('Açık Konak.', 'Open Stays')}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-none bg-gradient-to-br from-rose-50 to-rose-100/60 shadow-sm">
                    <CardContent className="px-4 py-3">
                      <div className="mb-1 flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10">
                          <Shield className="h-4 w-4 text-rose-600" />
                        </div>
                      </div>
                      <div className="font-[Space_Grotesk] text-2xl font-bold text-rose-700">{money(reportSummary.openBalance)}</div>
                      <div className="text-xs text-rose-500">{t('Açık Bakiye', 'Open Balance')}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* ── Detail Cards Grid ── */}
                <div className="grid gap-4 lg:grid-cols-3">
                  {/* Column 1: Outlet Performance + Debtors */}
                  <div className="flex flex-col gap-4">
                    <Card className="overflow-hidden">
                      <CardHeader className="border-b border-slate-100 pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                          <Building2 className="h-4 w-4 text-teal-600" />
                          {t('Outlet Performansı', 'Outlet Performance')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="max-h-[280px] space-y-2 overflow-auto pt-3 pr-1">
                        {reportDetails.topOutlets.map((row) => (
                          <div
                            key={row.outlet_name}
                            className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                          >
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{row.outlet_name}</div>
                              <div className="text-xs text-slate-500">
                                {row.orders} {t('sipariş', 'orders')}
                              </div>
                            </div>
                            <div className="font-semibold text-slate-900">{money(row.revenue)}</div>
                          </div>
                        ))}
                        {!reportDetails.topOutlets.length && (
                          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">
                            {t('Bugün outlet verisi yok.', 'No outlet data for today.')}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden">
                      <CardHeader className="border-b border-slate-100 pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                          <Shield className="h-4 w-4 text-rose-500" />
                          {t('Yüksek Bakiyeler', 'Top Balances')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="max-h-[280px] space-y-2 overflow-auto pt-3 pr-1">
                        {reportDetails.topDebtors.map((row) => (
                          <div
                            key={row.stay_id}
                            className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2"
                          >
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {t('Oda', 'Room')} {row.room_number}
                              </div>
                              <div className="text-xs text-slate-500">{row.guest_name}</div>
                            </div>
                            <div className="font-semibold text-rose-600">{money(row.balance)}</div>
                          </div>
                        ))}
                        {!reportDetails.topDebtors.length && (
                          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">
                            {t('Açık bakiye yok.', 'No open balances.')}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Column 2: Payment Methods + Hourly Activity */}
                  <div className="flex flex-col gap-4">
                    <Card className="overflow-hidden">
                      <CardHeader className="border-b border-slate-100 pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                          <CreditCard className="h-4 w-4 text-teal-600" />
                          {t('Ödeme Dağılımı', 'Payment Distribution')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="max-h-[280px] space-y-2 overflow-auto pt-3 pr-1">
                        {reportDetails.paymentByMethod.map((row) => {
                          const max = reportDetails.paymentByMethod[0]?.total || 1
                          const ratio = Math.max(4, Math.round((Math.abs(row.total) / Math.max(1, Math.abs(max))) * 100))
                          return (
                            <div key={row.method} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                              <div className="mb-1 flex items-center justify-between text-sm">
                                <span className="font-medium text-slate-800">{paymentMethodLabel(row.method)}</span>
                                <span className="text-xs text-slate-500">
                                  {row.count} {t('işlem', 'tx')}
                                </span>
                              </div>
                              <div className="mb-1 h-1.5 rounded-full bg-slate-200">
                                <div className="h-1.5 rounded-full bg-teal-500 transition-all" style={{ width: `${ratio}%` }} />
                              </div>
                              <div className="text-right text-sm font-semibold text-slate-900">{money(row.total)}</div>
                            </div>
                          )
                        })}
                        {!reportDetails.paymentByMethod.length && (
                          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">
                            {t('Bugün ödeme kaydı yok.', 'No payment entries for today.')}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden">
                      <CardHeader className="border-b border-slate-100 pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                          <Clock3 className="h-4 w-4 text-indigo-500" />
                          {t('Saatlik Yoğunluk', 'Hourly Activity')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="max-h-[280px] space-y-1.5 overflow-auto pt-3 pr-1">
                        {reportDetails.hourlyLoad.map((row) => {
                          const maxOrders = Math.max(1, ...reportDetails.hourlyLoad.map((item) => item.orders))
                          const width = Math.max(6, Math.round((row.orders / maxOrders) * 100))
                          return (
                            <div key={row.hour} className="grid grid-cols-[48px_1fr_auto] items-center gap-2 text-sm">
                              <div className="font-mono text-xs font-medium text-slate-600">{String(row.hour).padStart(2, '0')}:00</div>
                              <div className="h-1.5 rounded-full bg-slate-200">
                                <div className="h-1.5 rounded-full bg-indigo-400 transition-all" style={{ width: `${width}%` }} />
                              </div>
                              <div className="text-xs tabular-nums text-slate-500">
                                {row.orders} / {money(row.revenue)}
                              </div>
                            </div>
                          )
                        })}
                        {!reportDetails.hourlyLoad.length && (
                          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">
                            {t('Bugün saatlik hareket yok.', 'No hourly activity for today.')}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Column 3: Recent Orders + Closed Checkouts */}
                  <div className="flex flex-col gap-4">
                    <Card className="overflow-hidden">
                      <CardHeader className="border-b border-slate-100 pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                          <ReceiptText className="h-4 w-4 text-teal-600" />
                          {t('Son Siparişler', 'Recent Orders')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="max-h-[300px] space-y-2 overflow-auto pt-3 pr-1">
                        {recentOrders.slice(0, 8).map((order) => (
                          <div
                            key={order.id}
                            className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                          >
                            <div>
                              <div className="text-sm font-semibold text-slate-900">#{order.id} · {order.outlet_name}</div>
                              <div className="text-xs text-slate-500">
                                {order.room_number} · {dateTime(order.created_at, locale)}
                              </div>
                            </div>
                            <div className="font-semibold text-slate-900">{money(order.total)}</div>
                          </div>
                        ))}
                        {!recentOrders.length && (
                          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">
                            {t('Sipariş bulunamadı.', 'No recent orders found.')}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden">
                      <CardHeader className="border-b border-slate-100 pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                          <LogOut className="h-4 w-4 text-slate-500" />
                          {t('Kapanan Checkout\'lar', 'Closed Checkouts')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="max-h-[250px] space-y-2 overflow-auto pt-3 pr-1">
                        {reportDetails.recentClosures.map((row) => (
                          <div
                            key={`${row.stay_id}-${row.closed_at}`}
                            className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold text-slate-900">
                                {t('Oda', 'Room')} {row.room_number}
                              </div>
                              <div className="text-xs text-slate-500">{dateTime(row.closed_at, locale)}</div>
                            </div>
                            <div className="text-xs text-slate-500">{row.guest_name}</div>
                          </div>
                        ))}
                        {!reportDetails.recentClosures.length && (
                          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">
                            {t('Bugün kapanan checkout yok.', 'No checkout closures today.')}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white ${toast.type === 'error' ? 'bg-rose-600' : 'bg-teal-700'
            }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
