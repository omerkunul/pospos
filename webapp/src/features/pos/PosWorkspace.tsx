import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Keyboard,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  UtensilsCrossed,
} from 'lucide-react'
import { db } from '@/lib/supabase'
import type { Locale, MenuItem, Outlet, StayListItem, StaffUser } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type PosWorkspaceProps = {
  currentUser: StaffUser
  locale: Locale
  onToast: (message: string, type?: 'success' | 'error') => void
  onDataChanged?: () => void
}

type CartItem = {
  id: number
  name: string
  price: number
  image_url: string | null
  category: string
  qty: number
}

type RecentOrder = {
  id: number
  created_at: string
  outlet_name: string
  room_number: string
  total: number
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

const fallbackImage =
  'https://www.themealdb.com/images/media/meals/1548772327.jpg'

export function PosWorkspace({ currentUser, locale, onToast, onDataChanged }: PosWorkspaceProps) {
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [stays, setStays] = useState<StayListItem[]>([])
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])

  const [selectedOutlet, setSelectedOutlet] = useState('')
  const [accountMode, setAccountMode] = useState<'room' | 'walkin'>('room')
  const [selectedStayId, setSelectedStayId] = useState('')

  const [menuSearch, setMenuSearch] = useState('')
  const [roomSearch, setRoomSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [orderNote, setOrderNote] = useState('')

  const [cart, setCart] = useState<CartItem[]>([])

  const [isLoading, setIsLoading] = useState(false)
  const [isSavingOrder, setIsSavingOrder] = useState(false)
  const [showHotkeys, setShowHotkeys] = useState(false)

  const menuSearchRef = useRef<HTMLInputElement>(null)
  const roomSearchRef = useRef<HTMLInputElement>(null)

  function t(tr: string, en: string) {
    return locale === 'en' ? en : tr
  }

  function categoryLabel(value: string | null | undefined) {
    const key = value || 'Genel'
    if (locale !== 'en') return key

    const map: Record<string, string> = {
      Burger: 'Burger',
      Pizza: 'Pizza',
      'Ana Yemek': 'Main Course',
      Atistirmalik: 'Snack',
      'Alkolsuz Icecek': 'Soft Drink',
      'Alkollu Icecek': 'Alcoholic Drink',
      Tatli: 'Dessert',
      Genel: 'General',
    }

    return map[key] || key
  }

  const categoryOptions = useMemo(() => {
    const categories = Array.from(
      new Set(
        menuItems
          .filter((item) => String(item.outlet_id) === selectedOutlet)
          .map((item) => item.category || 'Genel'),
      ),
    )

    return ['all', ...categories]
  }, [menuItems, selectedOutlet])

  const filteredStays = useMemo(() => {
    const q = roomSearch.trim().toLowerCase()
    if (!q) return stays

    return stays.filter((stay) => {
      const room = stay.room?.room_number?.toLowerCase() || ''
      const guest = stay.guest?.full_name?.toLowerCase() || ''
      return room.includes(q) || guest.includes(q)
    })
  }, [stays, roomSearch])

  const visibleMenuItems = useMemo(() => {
    const q = menuSearch.trim().toLowerCase()

    return menuItems.filter((item) => {
      const byOutlet = String(item.outlet_id) === selectedOutlet
      const byCategory = selectedCategory === 'all' || item.category === selectedCategory
      const bySearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)

      return byOutlet && byCategory && bySearch
    })
  }, [menuItems, selectedOutlet, selectedCategory, menuSearch])

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0),
    [cart],
  )

  const selectedStay = useMemo(
    () => stays.find((stay) => String(stay.id) === selectedStayId) || null,
    [stays, selectedStayId],
  )

  function goToNextStay() {
    if (!filteredStays.length) return
    const idx = filteredStays.findIndex((stay) => String(stay.id) === selectedStayId)
    const next = idx < 0 ? 0 : (idx + 1) % filteredStays.length
    setSelectedStayId(String(filteredStays[next].id))
  }

  function goToPrevStay() {
    if (!filteredStays.length) return
    const idx = filteredStays.findIndex((stay) => String(stay.id) === selectedStayId)
    const prev = idx <= 0 ? filteredStays.length - 1 : idx - 1
    setSelectedStayId(String(filteredStays[prev].id))
  }

  async function loadBootstrap() {
    setIsLoading(true)

    const [outletsRes, menuRes, staysRes] = await Promise.all([
      db.from('outlets').select('id,name').order('name', { ascending: true }),
      db
        .from('menu_items')
        .select('id,outlet_id,name,category,price,image_url,is_active')
        .eq('is_active', true)
        .order('name', { ascending: true }),
      db
        .from('stays')
        .select(
          'id,check_in,check_out_plan,room:rooms!stays_room_id_fkey(id,room_number),guest:guests!stays_guest_id_fkey(id,full_name,phone)',
        )
        .eq('status', 'open')
        .order('check_in', { ascending: false }),
    ])

    if (outletsRes.error || menuRes.error || staysRes.error) {
      setIsLoading(false)
      throw new Error(
        outletsRes.error?.message || menuRes.error?.message || staysRes.error?.message || 'Veri yuklenemedi',
      )
    }

    const outletRows = (outletsRes.data || []) as Outlet[]
    const menuRows = (menuRes.data || []) as MenuItem[]

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

    const stayRows: StayListItem[] = rawStays.map((stay) => ({
      id: stay.id,
      check_in: stay.check_in,
      check_out_plan: stay.check_out_plan,
      room: pickOne(stay.room),
      guest: pickOne(stay.guest),
      balance: 0,
    }))

    setOutlets(outletRows)
    setMenuItems(menuRows)
    setStays(stayRows)

    if (!selectedOutlet && outletRows.length > 0) {
      setSelectedOutlet(String(outletRows[0].id))
    }

    if (!selectedStayId && stayRows.length > 0) {
      setSelectedStayId(String(stayRows[0].id))
    }

    setIsLoading(false)
  }

  async function loadRecentOrders() {
    const ordersRes = await db
      .from('orders')
      .select('id,created_at,stay_id,outlet_id')
      .order('created_at', { ascending: false })
      .limit(15)

    if (ordersRes.error) {
      throw new Error(ordersRes.error.message)
    }

    const rows = ordersRes.data || []
    const orderIds = rows.map((row) => row.id)
    const stayIds = rows.map((row) => row.stay_id).filter(Boolean) as number[]

    const [totalsRes, outletsRes, staysRes] = await Promise.all([
      db
        .from('v_order_totals')
        .select('order_id,total')
        .in('order_id', orderIds.length ? orderIds : [-1]),
      db.from('outlets').select('id,name'),
      db
        .from('stays')
        .select('id,room:rooms!stays_room_id_fkey(room_number)')
        .in('id', stayIds.length ? stayIds : [-1]),
    ])

    if (totalsRes.error || outletsRes.error || staysRes.error) {
      throw new Error(
        totalsRes.error?.message || outletsRes.error?.message || staysRes.error?.message || t('Liste alinamadi', 'Unable to fetch list'),
      )
    }

    const totalMap = new Map(
      (totalsRes.data || []).map((row: { order_id: number; total: number }) => [
        row.order_id,
        Number(row.total || 0),
      ]),
    )

    const outletMap = new Map(
      (outletsRes.data || []).map((row: { id: number; name: string }) => [row.id, row.name]),
    )

    const roomMap = new Map(
      (staysRes.data || []).map((row: { id: number; room: { room_number: string }[] | null }) => [
        row.id,
        pickOne(row.room)?.room_number || '-',
      ]),
    )

    const prepared: RecentOrder[] = rows.map((order) => ({
      id: Number(order.id),
      created_at: String(order.created_at),
      outlet_name: outletMap.get(Number(order.outlet_id)) || '-',
      room_number: order.stay_id ? roomMap.get(Number(order.stay_id)) || '-' : t('Yuruyen', 'Walk-in'),
      total: totalMap.get(Number(order.id)) || 0,
    }))

    setRecentOrders(prepared)
  }

  useEffect(() => {
    loadBootstrap()
      .then(() => loadRecentOrders())
      .catch((err: Error) => onToast(err.message, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      if (event.key === '?') {
        event.preventDefault()
        setShowHotkeys((value) => !value)
        return
      }

      if (event.key === '/') {
        event.preventDefault()
        menuSearchRef.current?.focus()
        return
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        roomSearchRef.current?.focus()
        return
      }

      if (event.altKey && event.key.toLowerCase() === 'w') {
        event.preventDefault()
        setAccountMode('walkin')
        return
      }

      if (event.altKey && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        setAccountMode('room')
        return
      }

      if (accountMode === 'room' && event.altKey && event.key === 'ArrowDown') {
        event.preventDefault()
        goToNextStay()
        return
      }

      if (accountMode === 'room' && event.altKey && event.key === 'ArrowUp') {
        event.preventDefault()
        goToPrevStay()
        return
      }

      if (event.altKey && event.key === 'Backspace') {
        event.preventDefault()
        setCart([])
        return
      }

      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault()
        void handleSaveOrder(true)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, accountMode, selectedStayId, selectedOutlet, orderNote])

  function addItem(item: MenuItem) {
    setCart((prev) => {
      const found = prev.find((entry) => entry.id === item.id)
      if (found) {
        return prev.map((entry) =>
          entry.id === item.id ? { ...entry, qty: entry.qty + 1 } : entry,
        )
      }

      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          price: Number(item.price),
          image_url: item.image_url,
          category: item.category,
          qty: 1,
        },
      ]
    })
  }

  function updateQty(itemId: number, diff: number) {
    setCart((prev) =>
      prev
        .map((entry) =>
          entry.id === itemId ? { ...entry, qty: Math.max(0, entry.qty + diff) } : entry,
        )
        .filter((entry) => entry.qty > 0),
    )
  }

  function removeItem(itemId: number) {
    setCart((prev) => prev.filter((entry) => entry.id !== itemId))
  }

  async function handleSaveOrder(withPrint = true) {
    if (!selectedOutlet) {
      onToast(t('Outlet secin.', 'Select an outlet.'), 'error')
      return
    }

    if (!cart.length) {
      onToast(t('Sepete en az bir urun ekleyin.', 'Add at least one item to the cart.'), 'error')
      return
    }

    if (accountMode === 'room' && !selectedStayId) {
      onToast(t('Oda hesabi icin konaklama secin.', 'Select a stay for room account.'), 'error')
      return
    }

    setIsSavingOrder(true)

    const orderRes = await db
      .from('orders')
      .insert({
        stay_id: accountMode === 'room' ? Number(selectedStayId) : null,
        outlet_id: Number(selectedOutlet),
        status: 'closed',
        order_source: 'pos',
        note: orderNote || null,
      })
      .select('id,created_at')
      .single()

    if (orderRes.error || !orderRes.data) {
      setIsSavingOrder(false)
      onToast(orderRes.error?.message || t('Siparis olusturulamadi.', 'Order could not be created.'), 'error')
      return
    }

    const orderId = Number(orderRes.data.id)

    const itemsPayload = cart.map((item) => ({
      order_id: orderId,
      menu_item_id: item.id,
      item_name: item.name,
      quantity: item.qty,
      unit_price: item.price,
    }))

    const insertItemsRes = await db.from('order_items').insert(itemsPayload)
    if (insertItemsRes.error) {
      setIsSavingOrder(false)
      onToast(insertItemsRes.error.message, 'error')
      return
    }

    if (withPrint) {
      printReceipt(orderId, orderRes.data.created_at)
    }

    setCart([])
    setOrderNote('')
    setIsSavingOrder(false)

    await loadRecentOrders()
    onDataChanged?.()
    onToast(t('Adisyon kaydedildi.', 'Order saved.'), 'success')
  }

  function printReceipt(orderId: number, createdAt: string) {
    const outletName = outlets.find((o) => String(o.id) === selectedOutlet)?.name || '-'
    const roomLabel =
      accountMode === 'walkin'
        ? t('Yuruyen', 'Walk-in')
        : `${t('Oda', 'Room')} ${selectedStay?.room?.room_number || '-'} - ${selectedStay?.guest?.full_name || '-'}`

    const lines = cart
      .map(
        (item) => `
          <tr>
            <td>${item.name}</td>
            <td class="num">${item.qty}</td>
            <td class="num">${money(item.qty * item.price)}</td>
          </tr>
        `,
      )
      .join('')

    const doc = window.open('', '_blank', 'width=420,height=760')
    if (!doc) {
      onToast(t('Yazdirma popup engellendi.', 'Print popup is blocked.'), 'error')
      return
    }

    doc.document.write(`
      <html>
      <head>
        <title>Adisyon #${orderId}</title>
        <style>
          :root {
            --paper-width: 80mm;
            --paper-content: 72mm;
          }

          * { box-sizing: border-box; }

          body {
            margin: 0;
            font-family: ui-monospace, Menlo, monospace;
            background: #e5e7eb;
            color: #111827;
          }

          .toolbar {
            position: sticky;
            top: 0;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 10px 12px;
            background: #0f172a;
            color: #f8fafc;
          }

          .toolbar-title {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: .02em;
          }

          .toolbar-actions {
            display: flex;
            gap: 8px;
          }

          .btn {
            border: 0;
            border-radius: 8px;
            padding: 8px 10px;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
          }

          .btn-send {
            background: #0d9488;
            color: #ecfeff;
          }

          .btn-close {
            background: #334155;
            color: #f8fafc;
          }

          .stage {
            display: flex;
            justify-content: center;
            padding: 12px;
          }

          .receipt {
            width: var(--paper-width);
            background: #ffffff;
            padding: 3mm;
            border: 1px solid #cbd5e1;
            box-shadow: 0 12px 24px rgba(2, 6, 23, .16);
          }

          .center { text-align: center; }
          .muted { color: #475569; }
          .line {
            margin: 6px 0;
            border-top: 1px dashed #94a3b8;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }

          td, th {
            border-bottom: 1px dashed #cbd5e1;
            padding: 4px 0;
            text-align: left;
            vertical-align: top;
          }

          td.num, th.num {
            text-align: right;
            white-space: nowrap;
          }

          .total {
            margin-top: 6px;
            font-weight: 700;
            font-size: 13px;
            display: flex;
            justify-content: space-between;
          }

          .footnote {
            margin-top: 8px;
            font-size: 11px;
          }

          @page {
            size: 80mm auto;
            margin: 2mm;
          }

          @media print {
            body {
              background: #fff;
            }

            .toolbar {
              display: none !important;
            }

            .stage {
              padding: 0;
            }

            .receipt {
              width: var(--paper-content);
              border: 0;
              box-shadow: none;
              padding: 0;
            }
          }
        </style>
        <script>
          function sendToPrinter() {
            window.focus();
            window.print();
          }

          function closePreview() {
            window.close();
          }
        </script>
      </head>
      <body>
        <div class="toolbar">
          <div class="toolbar-title">Thermal Fis Onizleme · #${orderId}</div>
          <div class="toolbar-actions">
            <button class="btn btn-send" onclick="sendToPrinter()">Yaziciya Gonder</button>
            <button class="btn btn-close" onclick="closePreview()">Kapat</button>
          </div>
        </div>

        <div class="stage">
          <div class="receipt">
            <div class="center">
              <div><strong>HOTEL POS ADISYON</strong></div>
              <div class="muted">No: #${orderId}</div>
            </div>
            <div class="line"></div>
            <div>Tarih: ${dateTime(createdAt, locale)}</div>
            <div>Outlet: ${outletName}</div>
            <div>Hesap: ${roomLabel}</div>
            <div class="line"></div>
            <table>
              <thead>
                <tr><th>Urun</th><th class="num">Adet</th><th class="num">Tutar</th></tr>
              </thead>
              <tbody>${lines}</tbody>
            </table>
            <div class="total">
              <span>TOPLAM</span>
              <span>${money(cartTotal)}</span>
            </div>
            <div class="line"></div>
            <div class="footnote">Not: ${orderNote || '-'}</div>
            <div class="footnote center muted">Tesekkurler</div>
          </div>
        </div>
      </body>
      </html>
    `)

    doc.document.close()
    doc.focus()
  }

  return (
    <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UtensilsCrossed className="h-5 w-5 text-teal-700" />
            Servis POS - Adisyon girisi
          </CardTitle>
          <CardDescription>
            Hedef akis: outlet sec, urunleri ekle, oda/yuruyen sec, adisyonu tek adimda kaydet.
          </CardDescription>
          <div className="text-xs font-medium text-slate-500">
            Aktif personel: {currentUser.display_name} ({currentUser.role})
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1 block">Outlet</Label>
              <Select
                value={selectedOutlet}
                onChange={setSelectedOutlet}
                options={outlets.map((outlet) => ({
                  value: String(outlet.id),
                  label: outlet.name,
                }))}
                disabled={isLoading || !outlets.length}
              />
            </div>
            <div>
              <Label className="mb-1 block">Hesap tipi</Label>
              <Select
                value={accountMode}
                onChange={(value) => setAccountMode(value as 'room' | 'walkin')}
                options={[
                  { value: 'room', label: 'Oda hesabi' },
                  { value: 'walkin', label: 'Yuruyen musteri' },
                ]}
                disabled={isSavingOrder}
              />
            </div>
          </div>

          {accountMode === 'room' && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <Label className="block">Konaklama secimi</Label>
              <Input
                ref={roomSearchRef}
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredStays.length > 0) {
                    setSelectedStayId(String(filteredStays[0].id))
                  }
                }}
                placeholder="Oda no veya misafir ara"
              />
              <Select
                value={selectedStayId}
                onChange={setSelectedStayId}
                options={
                  filteredStays.length
                    ? filteredStays.map((stay) => ({
                        value: String(stay.id),
                        label: `Oda ${stay.room?.room_number || '-'} - ${stay.guest?.full_name || '-'}`,
                      }))
                    : [{ value: '', label: 'Aktif konaklama yok' }]
                }
                disabled={!filteredStays.length}
              />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={goToPrevStay}>
                  Onceki oda (Alt+↑)
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={goToNextStay}>
                  Sonraki oda (Alt+↓)
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                ref={menuSearchRef}
                className="pl-9"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Urun veya kategori ara (kisa yol: /)"
              />
            </div>
            <Select
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={categoryOptions.map((cat) => ({
                value: cat,
                label: cat === 'all' ? 'Tum kategoriler' : cat,
              }))}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleMenuItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => addItem(item)}
                  className="group rounded-2xl border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-sm"
                >
                  <img
                    src={item.image_url || fallbackImage}
                    alt={item.name}
                    className="h-28 w-full rounded-t-2xl object-cover"
                  />
                  <div className="space-y-1 p-3">
                    <div className="text-xs font-medium text-slate-500">{item.category || 'Genel'}</div>
                    <div className="line-clamp-1 font-semibold text-slate-900">{item.name}</div>
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-800">{money(Number(item.price))}</div>
                      <Badge className="group-hover:bg-teal-200" variant="neutral">
                        Ekle
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {!visibleMenuItems.length && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                Secilen filtreye uygun menu urunu yok.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid min-h-0 gap-5 xl:grid-rows-[auto_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShoppingCart className="h-5 w-5 text-teal-700" />
              Adisyon sepeti
            </CardTitle>
            <CardDescription>
              Hedef: maksimum 45 sn icinde urun secimi ve adisyonu kaydetme.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm text-slate-600">Hesap sahibi</div>
              <div className="font-semibold text-slate-900">
                {accountMode === 'walkin'
                  ? 'Yuruyen musteri'
                  : selectedStay
                    ? `Oda ${selectedStay.room?.room_number || '-'} - ${selectedStay.guest?.full_name || '-'}`
                    : 'Konaklama secilmedi'}
              </div>
            </div>

            <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
              {!cart.length && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  Sepet bos. Urun kartina tiklayarak ekleyin.
                </div>
              )}

              {cart.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.category}</div>
                    </div>
                    <button
                      type="button"
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => updateQty(item.id, -1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold">{item.qty}</span>
                      <Button variant="secondary" size="sm" onClick={() => updateQty(item.id, 1)}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="text-sm font-bold text-slate-800">{money(item.qty * item.price)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <Label className="mb-1 block">Adisyon notu</Label>
              <Textarea
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="Orn: az tuzlu, buzsuz"
                className="min-h-[74px]"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Toplam</span>
                <strong className="text-lg text-slate-900">{money(cartTotal)}</strong>
              </div>
            </div>

            <div className="grid gap-2">
              <Button
                onClick={() => {
                  void handleSaveOrder(true)
                }}
                disabled={isSavingOrder || !cart.length}
              >
                <Printer className="h-4 w-4" />
                {isSavingOrder ? 'Kaydediliyor...' : 'Kaydet + yazdir (Ctrl+Enter)'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void handleSaveOrder(false)
                }}
                disabled={isSavingOrder || !cart.length}
              >
                Kaydet (yazdirma yok)
              </Button>
              <Button variant="ghost" onClick={() => setCart([])} disabled={!cart.length || isSavingOrder}>
                Sepeti temizle (Alt+Backspace)
              </Button>
            </div>

            <details open={showHotkeys} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                <Keyboard className="h-4 w-4" />
                POS kisayollari
              </summary>
              <div className="mt-2 grid gap-1 text-xs text-slate-600">
                <div>/ : menu arama odagi</div>
                <div>Ctrl+K : oda arama odagi</div>
                <div>Alt+R : Oda hesabi modu</div>
                <div>Alt+W : Yuruyen musteri modu</div>
                <div>Alt+↑ / Alt+↓ : oda degistir</div>
                <div>Ctrl+Enter : kaydet + yazdir</div>
                <div>Alt+Backspace : sepeti temizle</div>
                <div>? : kisayol paneli ac/kapat</div>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card className="min-h-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="h-4 w-4 text-teal-700" />
              Son kayitli adisyonlar
            </CardTitle>
            <CardDescription>Son 15 adisyon - servis kontrolu icin hizli gorunum.</CardDescription>
          </CardHeader>
          <CardContent className="h-full overflow-auto pr-1">
            <div className="space-y-2">
              {recentOrders.map((order) => (
                <div key={order.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">#{order.id}</div>
                      <div className="text-xs text-slate-500">
                        {order.outlet_name} · {order.room_number} · {dateTime(order.created_at, locale)}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-slate-800">{money(order.total)}</div>
                  </div>
                </div>
              ))}
              {!recentOrders.length && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  Henuz adisyon yok.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
