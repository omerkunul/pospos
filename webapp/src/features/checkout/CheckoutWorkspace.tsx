import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Keyboard,
  Pencil,
  Printer,
  Search,
  Wallet,
  XCircle,
} from 'lucide-react'
import { db } from '@/lib/supabase'
import type {
  Locale,
  Outlet,
  OrderItemRow,
  OrderRow,
  PaymentAuditLog,
  PaymentRow,
  StaffUser,
  StayListItem,
} from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type CheckoutWorkspaceProps = {
  currentUser: StaffUser
  locale: Locale
  onToast: (message: string, type?: 'success' | 'error') => void
  onDataChanged?: () => void
}

type PreparedOrder = OrderRow & {
  outletName: string
  items: OrderItemRow[]
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

export function CheckoutWorkspace({ currentUser, locale, onToast, onDataChanged }: CheckoutWorkspaceProps) {
  const [searchText, setSearchText] = useState('')
  const [stays, setStays] = useState<StayListItem[]>([])
  const [selectedStayId, setSelectedStayId] = useState<number | null>(null)
  const [outlets, setOutlets] = useState<Outlet[]>([])

  const [orders, setOrders] = useState<PreparedOrder[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [auditLogs, setAuditLogs] = useState<PaymentAuditLog[]>([])

  const [isLoadingStays, setIsLoadingStays] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const [paymentMethod, setPaymentMethod] = useState('nakit')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')

  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null)
  const [editMethod, setEditMethod] = useState('nakit')
  const [editAmount, setEditAmount] = useState('')
  const [editReason, setEditReason] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const [showHotkeys, setShowHotkeys] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const paymentAmountRef = useRef<HTMLInputElement>(null)

  const paymentMethods = useMemo(
    () =>
      locale === 'en'
        ? [
            { label: 'Cash', value: 'nakit' },
            { label: 'Card', value: 'kart' },
            { label: 'Wire / EFT', value: 'havale' },
            { label: 'Other', value: 'diger' },
          ]
        : [
            { label: 'Nakit', value: 'nakit' },
            { label: 'Kart', value: 'kart' },
            { label: 'Havale / EFT', value: 'havale' },
            { label: 'Diger', value: 'diger' },
          ],
    [locale],
  )

  const selectedStay = useMemo(
    () => stays.find((s) => s.id === selectedStayId) || null,
    [stays, selectedStayId],
  )

  const totals = useMemo(() => {
    const charges = orders.reduce((sum, order) => sum + order.total, 0)
    const paid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
    const remaining = charges - paid

    return { charges, paid, remaining }
  }, [orders, payments])

  const projectedRemaining = useMemo(() => {
    const amount = Number(paymentAmount || 0)
    if (!amount) return totals.remaining
    return totals.remaining - amount
  }, [paymentAmount, totals.remaining])

  const filteredStays = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return stays

    return stays.filter((stay) => {
      const room = stay.room?.room_number?.toLowerCase() || ''
      const guest = stay.guest?.full_name?.toLowerCase() || ''
      return room.includes(q) || guest.includes(q)
    })
  }, [searchText, stays])

  async function loadStays() {
    setIsLoadingStays(true)

    const staysRes = await db
      .from('stays')
      .select(
        'id,check_in,check_out_plan,room:rooms!stays_room_id_fkey(id,room_number),guest:guests!stays_guest_id_fkey(id,full_name,phone)',
      )
      .eq('status', 'open')
      .order('check_in', { ascending: false })

    if (staysRes.error) {
      setIsLoadingStays(false)
      throw new Error(staysRes.error.message)
    }

    const raw = (staysRes.data || []) as Array<{
      id: number
      check_in: string
      check_out_plan: string | null
      room: { id: number; room_number: string } | { id: number; room_number: string }[] | null
      guest:
        | { id: number; full_name: string; phone: string | null }
        | { id: number; full_name: string; phone: string | null }[]
        | null
    }>

    const fetched: Omit<StayListItem, 'balance'>[] = raw.map((stay) => ({
      id: stay.id,
      check_in: stay.check_in,
      check_out_plan: stay.check_out_plan,
      room: pickOne(stay.room),
      guest: pickOne(stay.guest),
    }))

    const stayIds = fetched.map((stay) => stay.id)
    let balanceMap = new Map<number, number>()

    if (stayIds.length > 0) {
      const balanceRes = await db
        .from('v_stay_balance')
        .select('stay_id,balance')
        .in('stay_id', stayIds)

      if (balanceRes.error) {
        setIsLoadingStays(false)
        throw new Error(balanceRes.error.message)
      }

      balanceMap = new Map(
        (balanceRes.data || []).map((row: { stay_id: number; balance: number }) => [
          row.stay_id,
          Number(row.balance || 0),
        ]),
      )
    }

    const merged = fetched.map((stay) => ({
      ...stay,
      balance: balanceMap.get(stay.id) || 0,
    }))

    setStays(merged)

    if (!selectedStayId && merged.length > 0) {
      setSelectedStayId(merged[0].id)
    }

    if (selectedStayId && !merged.some((item) => item.id === selectedStayId)) {
      setSelectedStayId(merged[0]?.id || null)
    }

    setIsLoadingStays(false)
  }

  async function loadDetailsForStay(stayId: number | null) {
    if (!stayId) {
      setOrders([])
      setPayments([])
      setAuditLogs([])
      return
    }

    setIsLoadingDetails(true)

    const ordersRes = await db
      .from('orders')
      .select('id,created_at,note,outlet_id')
      .eq('stay_id', stayId)
      .order('created_at', { ascending: false })

    if (ordersRes.error) {
      setIsLoadingDetails(false)
      throw new Error(ordersRes.error.message)
    }

    const ordersData = (ordersRes.data || []) as OrderRow[]
    const orderIds = ordersData.map((order) => order.id)

    const [itemsRes, paymentsRes, auditRes] = await Promise.all([
      orderIds.length
        ? db
            .from('order_items')
            .select('order_id,item_name,quantity,unit_price')
            .in('order_id', orderIds)
        : Promise.resolve({ data: [], error: null }),
      db
        .from('payments')
        .select('id,stay_id,method,amount,entry_type,reference_payment_id,note,created_at')
        .eq('stay_id', stayId)
        .order('created_at', { ascending: false }),
      db
        .from('payment_audit_logs')
        .select(
          'id,stay_id,payment_id,action,old_amount,new_amount,old_method,new_method,reason,actor_user_id,metadata,created_at',
        )
        .eq('stay_id', stayId)
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    if (itemsRes.error) {
      setIsLoadingDetails(false)
      throw new Error(itemsRes.error.message)
    }

    if (paymentsRes.error) {
      setIsLoadingDetails(false)
      throw new Error(paymentsRes.error.message)
    }

    if (auditRes.error) {
      setIsLoadingDetails(false)
      throw new Error(auditRes.error.message)
    }

    const itemsData = (itemsRes.data || []) as OrderItemRow[]
    const paymentsData = (paymentsRes.data || []) as PaymentRow[]
    const auditData = (auditRes.data || []) as PaymentAuditLog[]

    const outletMap = new Map(outlets.map((outlet) => [outlet.id, outlet.name]))
    const itemMap = new Map<number, OrderItemRow[]>()

    itemsData.forEach((item) => {
      if (!itemMap.has(item.order_id)) {
        itemMap.set(item.order_id, [])
      }
      itemMap.get(item.order_id)?.push(item)
    })

    const preparedOrders: PreparedOrder[] = ordersData.map((order) => {
      const groupedItems = itemMap.get(order.id) || []
      const total = groupedItems.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
        0,
      )

      return {
        ...order,
        outletName: outletMap.get(order.outlet_id) || '-',
        items: groupedItems,
        total,
      }
    })

    setOrders(preparedOrders)
    setPayments(paymentsData)
    setAuditLogs(auditData)
    setIsLoadingDetails(false)
  }

  async function initialize() {
    const outletsRes = await db.from('outlets').select('id,name').order('name', { ascending: true })
    if (outletsRes.error) throw new Error(outletsRes.error.message)
    setOutlets((outletsRes.data || []) as Outlet[])

    await loadStays()
  }

  async function refreshAll() {
    await loadStays()
    await loadDetailsForStay(selectedStayId)
    onDataChanged?.()
  }

  async function handleAddPayment(customAmount?: number, quickNote?: string) {
    if (!selectedStayId) {
      onToast('Once konaklama secin.', 'error')
      return
    }

    const amount = customAmount ?? Number(paymentAmount)
    if (!amount || amount <= 0) {
      onToast('Gecerli bir odeme tutari girin.', 'error')
      return
    }

    setIsSubmittingPayment(true)

    const paymentRes = await db.from('payments').insert({
      stay_id: selectedStayId,
      method: paymentMethod,
      amount,
      entry_type: 'payment',
      note: quickNote || paymentNote || null,
    })

    setIsSubmittingPayment(false)

    if (paymentRes.error) {
      onToast(paymentRes.error.message, 'error')
      return
    }

    setPaymentAmount('')
    setPaymentNote('')

    await refreshAll()
    onToast('Odeme basariyla kaydedildi.', 'success')
  }

  async function handleQuickCollectRemaining() {
    if (totals.remaining <= 0) {
      onToast('Kalan bakiye yok.', 'error')
      return
    }

    await handleAddPayment(Number(totals.remaining.toFixed(2)), 'Hizli tahsilat (kalan bakiye)')
  }

  async function cancelPayment(payment: PaymentRow) {
    if (Number(payment.amount) <= 0) {
      onToast('Bu kayit iptal edilemez.', 'error')
      return
    }

    const reason = window.prompt('Iptal nedeni girin:')
    if (!reason) return

    const reverseRes = await db
      .from('payments')
      .insert({
        stay_id: payment.stay_id,
        method: payment.method,
        amount: -Math.abs(Number(payment.amount)),
        entry_type: 'reversal',
        reference_payment_id: payment.id,
        note: `Iptal: ${reason}`,
      })
      .select('id')
      .single()

    if (reverseRes.error) {
      onToast(reverseRes.error.message, 'error')
      return
    }

    const auditRes = await db.from('payment_audit_logs').insert({
      stay_id: payment.stay_id,
      payment_id: payment.id,
      action: 'cancel',
      old_amount: Number(payment.amount),
      new_amount: 0,
      old_method: payment.method,
      new_method: null,
      reason,
      actor_user_id: currentUser.id,
      metadata: {
        reversal_payment_id: reverseRes.data.id,
      },
    })

    if (auditRes.error) {
      onToast(auditRes.error.message, 'error')
      return
    }

    await refreshAll()
    onToast('Odeme iptal edildi ve audit loga yazildi.', 'success')
  }

  function openEditPayment(payment: PaymentRow) {
    if (Number(payment.amount) <= 0) {
      onToast('Bu kayit duzenlenemez.', 'error')
      return
    }

    setEditingPayment(payment)
    setEditMethod(payment.method)
    setEditAmount(String(payment.amount))
    setEditReason('')
  }

  function closeEditPayment() {
    setEditingPayment(null)
    setEditMethod('nakit')
    setEditAmount('')
    setEditReason('')
  }

  async function savePaymentEdit() {
    if (!editingPayment) return

    const newAmount = Number(editAmount)
    if (!newAmount || newAmount <= 0) {
      onToast('Duzenleme tutari gecersiz.', 'error')
      return
    }

    if (!editReason.trim()) {
      onToast('Duzenleme nedeni zorunlu.', 'error')
      return
    }

    setIsSavingEdit(true)

    const reversalRes = await db
      .from('payments')
      .insert({
        stay_id: editingPayment.stay_id,
        method: editingPayment.method,
        amount: -Math.abs(Number(editingPayment.amount)),
        entry_type: 'reversal',
        reference_payment_id: editingPayment.id,
        note: `Duzenleme geri alimi: ${editReason}`,
      })
      .select('id')
      .single()

    if (reversalRes.error) {
      setIsSavingEdit(false)
      onToast(reversalRes.error.message, 'error')
      return
    }

    const replacementRes = await db
      .from('payments')
      .insert({
        stay_id: editingPayment.stay_id,
        method: editMethod,
        amount: newAmount,
        entry_type: 'adjustment',
        reference_payment_id: editingPayment.id,
        note: `Odeme duzeltme: ${editReason}`,
      })
      .select('id')
      .single()

    if (replacementRes.error) {
      setIsSavingEdit(false)
      onToast(replacementRes.error.message, 'error')
      return
    }

    const auditRes = await db.from('payment_audit_logs').insert({
      stay_id: editingPayment.stay_id,
      payment_id: editingPayment.id,
      action: 'edit',
      old_amount: Number(editingPayment.amount),
      new_amount: newAmount,
      old_method: editingPayment.method,
      new_method: editMethod,
      reason: editReason,
      actor_user_id: currentUser.id,
      metadata: {
        reversal_payment_id: reversalRes.data.id,
        replacement_payment_id: replacementRes.data.id,
      },
    })

    setIsSavingEdit(false)

    if (auditRes.error) {
      onToast(auditRes.error.message, 'error')
      return
    }

    closeEditPayment()
    await refreshAll()
    onToast('Odeme duzeltildi ve audit loga yazildi.', 'success')
  }

  async function handleCloseCheckout() {
    if (!selectedStayId) {
      onToast('Once konaklama secin.', 'error')
      return
    }

    if (totals.remaining > 0) {
      const proceed = window.confirm(
        `Bu odada ${money(totals.remaining)} kalan bakiye var. Yine de checkout kapatilsin mi?`,
      )
      if (!proceed) return
    }

    setIsClosing(true)

    const res = await db
      .from('stays')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', selectedStayId)

    setIsClosing(false)

    if (res.error) {
      onToast(res.error.message, 'error')
      return
    }

    onToast('Checkout kapatildi.', 'success')
    setSelectedStayId(null)
    setOrders([])
    setPayments([])
    setAuditLogs([])
    await loadStays()
    onDataChanged?.()
  }

  function printSummary() {
    if (!selectedStay) {
      onToast('Yazdirma icin once konaklama secin.', 'error')
      return
    }

    const doc = window.open('', '_blank', 'width=420,height=760')
    if (!doc) {
      onToast('Popup engellendi. Tarayici ayarlarini kontrol edin.', 'error')
      return
    }

    const lines = orders
      .map(
        (order) => `
          <tr>
            <td>#${order.id}</td>
            <td>${order.outletName}</td>
            <td>${new Date(order.created_at).toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR')}</td>
            <td style="text-align:right;">${money(order.total)}</td>
          </tr>
        `,
      )
      .join('')

    doc.document.write(`
      <html>
        <head>
          <title>Checkout Ozet</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: ui-monospace, Menlo, monospace;
              background: #f1f5f9;
              color: #0f172a;
              display: flex;
              justify-content: center;
              padding: 12px;
            }
            .paper {
              width: 82mm;
              min-height: 120mm;
              background: #fff;
              border: 1px solid #cbd5e1;
              box-shadow: 0 10px 24px rgba(2, 6, 23, .18);
              padding: 10px;
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            table { width: 100%; border-collapse: collapse; margin-top: 6px; }
            td, th { border-bottom: 1px dashed #94a3b8; padding: 4px 0; font-size: 11px; text-align: left; }
            td.num, th.num { text-align: right; white-space: nowrap; }
            h2, p { margin: 0; }
            .line { border-top: 1px dashed #94a3b8; margin: 2px 0; }
            .print-btn {
              margin-top: 8px;
              width: 100%;
              border: 0;
              border-radius: 8px;
              background: #0f766e;
              color: #ecfeff;
              font-weight: 700;
              font-size: 12px;
              padding: 9px 10px;
              cursor: pointer;
            }
            .print-btn:hover { background: #0d9488; }
            @page {
              size: 80mm auto;
              margin: 2mm;
            }
            @media print {
              body {
                background: #fff;
                padding: 0;
              }
              .paper {
                width: 76mm;
                border: 0;
                box-shadow: none;
                padding: 0;
              }
              .print-btn {
                display: none !important;
              }
            }
          </style>
          <script>
            function doPrint() {
              window.focus();
              window.print();
            }
          </script>
        </head>
        <body>
          <div class="paper">
            <h2>CHECKOUT OZETI</h2>
            <p>Oda: ${selectedStay.room?.room_number || '-'}</p>
            <p>Misafir: ${selectedStay.guest?.full_name || '-'}</p>
          <p>Tarih: ${new Date().toLocaleString(locale === 'en' ? 'en-US' : 'tr-TR')}</p>
            <div class="line"></div>
            <table>
              <thead>
                <tr><th>Adisyon</th><th>Outlet</th><th>Tarih</th><th class="num">Tutar</th></tr>
              </thead>
              <tbody>${lines}</tbody>
            </table>
            <div class="line"></div>
            <p><strong>Toplam Harcama:</strong> ${money(totals.charges)}</p>
            <p><strong>Toplam Odeme:</strong> ${money(totals.paid)}</p>
            <p><strong>Kalan Bakiye:</strong> ${money(totals.remaining)}</p>
            <button class="print-btn" onclick="doPrint()">Print</button>
          </div>
        </body>
      </html>
    `)

    doc.document.close()
    doc.focus()
  }

  function goToNextStay() {
    if (!filteredStays.length) return
    const idx = filteredStays.findIndex((item) => item.id === selectedStayId)
    const nextIdx = idx < 0 ? 0 : (idx + 1) % filteredStays.length
    setSelectedStayId(filteredStays[nextIdx].id)
  }

  function goToPrevStay() {
    if (!filteredStays.length) return
    const idx = filteredStays.findIndex((item) => item.id === selectedStayId)
    const prevIdx = idx <= 0 ? filteredStays.length - 1 : idx - 1
    setSelectedStayId(filteredStays[prevIdx].id)
  }

  useEffect(() => {
    initialize().catch((err: Error) => onToast(err.message, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadDetailsForStay(selectedStayId).catch((err: Error) => onToast(err.message, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStayId, outlets])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      const isReception = currentUser.role === 'resepsiyon' || currentUser.role === 'admin'
      if (!isReception) return

      if (event.key === '?') {
        event.preventDefault()
        setShowHotkeys((v) => !v)
        return
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault()
        goToNextStay()
        return
      }

      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault()
        goToPrevStay()
        return
      }

      if (event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        goToNextStay()
        return
      }

      if (event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        goToPrevStay()
        return
      }

      if (event.altKey && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        paymentAmountRef.current?.focus()
        return
      }

      if (event.altKey && event.key === '1') {
        event.preventDefault()
        setPaymentAmount('100')
        return
      }

      if (event.altKey && event.key === '2') {
        event.preventDefault()
        setPaymentAmount('250')
        return
      }

      if (event.altKey && event.key === '3') {
        event.preventDefault()
        setPaymentAmount('500')
        return
      }

      if (event.altKey && event.key === '0') {
        event.preventDefault()
        if (totals.remaining > 0) {
          setPaymentAmount(String(Number(totals.remaining.toFixed(2))))
        }
        return
      }

      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault()
        void handleAddPayment()
        return
      }

      if (event.altKey && event.key.toLowerCase() === 't') {
        event.preventDefault()
        void handleQuickCollectRemaining()
        return
      }

      if (event.altKey && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        void handleCloseCheckout()
        return
      }

      if (event.altKey && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        void refreshAll()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.role, filteredStays, selectedStayId, totals.remaining, paymentAmount])

  return (
    <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.35fr)]">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5 text-teal-700" />
            Oda secimi
          </CardTitle>
          <CardDescription>Oda numarasi veya misafir adi ile hizli arama yap.</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              ref={searchInputRef}
              className="pl-9"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Oda no veya misafir adi..."
            />
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={goToPrevStay}>
              <ChevronLeft className="h-4 w-4" />
              Onceki oda
            </Button>
            <Button variant="secondary" onClick={goToNextStay}>
              Sonraki oda
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
            {isLoadingStays && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                Konaklamalar yukleniyor...
              </div>
            )}

            {!isLoadingStays && !filteredStays.length && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                Bu kritere uygun oda bulunamadi.
              </div>
            )}

            {filteredStays.map((stay) => {
              const isActive = stay.id === selectedStayId
              return (
                <button
                  type="button"
                  key={stay.id}
                  onClick={() => setSelectedStayId(stay.id)}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left transition',
                    isActive
                      ? 'border-teal-600 bg-teal-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <div className="font-semibold text-slate-900">Oda {stay.room?.room_number || '-'}</div>
                    <Badge variant={stay.balance > 0 ? 'danger' : 'success'}>
                      {stay.balance > 0 ? `Borc ${money(stay.balance)}` : 'Odendi'}
                    </Badge>
                  </div>
                  <div className="text-sm text-slate-600">{stay.guest?.full_name || '-'}</div>
                  <div className="text-xs text-slate-500">Check-in: {dateTime(stay.check_in, locale)}</div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex min-h-0 flex-col">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg">Checkout workspace</CardTitle>
            <CardDescription>
              Solda folio kalemleri, sagda odeme islemleri. Islem sonunda checkout kapat.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="min-h-0 space-y-3 overflow-auto pr-1">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-sm font-semibold text-slate-700">Folio satirlari</div>
                {isLoadingDetails && (
                  <div className="text-sm text-slate-500">Folio hareketleri yukleniyor...</div>
                )}
                {!isLoadingDetails && !orders.length && (
                  <div className="text-sm text-slate-500">Bu konaklama icin adisyon kaydi yok.</div>
                )}
                <div className="space-y-2">
                  {orders.map((order) => (
                    <div key={order.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">#{order.id}</div>
                          <div className="text-xs text-slate-500">
                            {order.outletName} - {dateTime(order.created_at, locale)}
                          </div>
                        </div>
                        <Badge variant="neutral">{money(order.total)}</Badge>
                      </div>
                      <div className="space-y-1 text-sm text-slate-700">
                        {order.items.map((item, idx) => (
                          <div key={`${order.id}-${idx}`} className="flex justify-between gap-2">
                            <span>
                              {item.item_name} ({item.quantity}x)
                            </span>
                            <span>{money(Number(item.quantity) * Number(item.unit_price))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 text-sm font-semibold text-slate-700">Odeme gecmisi</div>
                {!payments.length && <div className="text-sm text-slate-500">Henuz odeme girilmedi.</div>}
                <div className="space-y-2">
                  {payments.map((payment) => {
                    const isReversal = Number(payment.amount) < 0 || payment.entry_type === 'reversal'
                    const canOperate = Number(payment.amount) > 0 && payment.entry_type !== 'reversal'

                    return (
                      <div
                        key={payment.id}
                        className={cn(
                          'rounded-lg border px-3 py-2',
                          isReversal
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-slate-200 bg-slate-50',
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{money(Number(payment.amount))}</div>
                            <div className="text-xs text-slate-500">
                              {payment.method} · {dateTime(payment.created_at, locale)}
                              {payment.entry_type ? ` · ${payment.entry_type}` : ''}
                            </div>
                          </div>
                          {canOperate && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openEditPayment(payment)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Duzelt
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  void cancelPayment(payment)
                                }}
                              >
                                Iptal
                              </Button>
                            </div>
                          )}
                        </div>
                        {payment.note && (
                          <div className="mt-1 text-xs text-slate-600">Not: {payment.note}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <details className="rounded-xl border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Odeme audit logu ({auditLogs.length})
                </summary>
                <div className="mt-3 space-y-2">
                  {!auditLogs.length && (
                    <div className="text-sm text-slate-500">Audit kaydi bulunamadi.</div>
                  )}
                  {auditLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <div className="text-xs font-semibold text-slate-800">
                        {log.action === 'cancel' ? 'Iptal' : 'Duzeltme'} · {dateTime(log.created_at, locale)}
                      </div>
                      <div className="text-xs text-slate-600">
                        once: {money(Number(log.old_amount || 0))} ({log.old_method || '-'})
                      </div>
                      <div className="text-xs text-slate-600">
                        sonra: {money(Number(log.new_amount || 0))} ({log.new_method || '-'})
                      </div>
                      <div className="text-xs text-slate-500">Neden: {log.reason || '-'}</div>
                    </div>
                  ))}
                </div>
              </details>
            </div>

            <div className="min-h-0 space-y-3 overflow-auto pr-1">
              <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <BadgeCheck className="h-4 w-4 text-teal-700" />
                  Toplamlar
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Toplam Harcama</span>
                    <strong className="text-slate-900">{money(totals.charges)}</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Toplam Odeme</span>
                    <strong className="text-slate-900">{money(totals.paid)}</strong>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-dashed border-slate-300 pt-2">
                    <span className="font-semibold text-slate-700">Kalan Bakiye</span>
                    <strong className={cn('text-base', totals.remaining > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                      {money(totals.remaining)}
                    </strong>
                  </div>
                </div>
              </div>

              {editingPayment && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 text-sm font-semibold text-amber-800">
                    Odeme duzeltme · #{editingPayment.id}
                  </div>
                  <div className="space-y-2">
                    <Label className="block">Yeni yontem</Label>
                      <Select
                        value={editMethod}
                        onChange={setEditMethod}
                        options={paymentMethods}
                      />
                    <Label className="block">Yeni tutar</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                    />
                    <Label className="block">Duzeltme nedeni</Label>
                    <Textarea
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      className="min-h-[70px]"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={closeEditPayment}>
                        Vazgec
                      </Button>
                      <Button onClick={savePaymentEdit} disabled={isSavingEdit}>
                        {isSavingEdit ? 'Kaydediliyor...' : 'Duzeltmeyi kaydet'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Wallet className="h-4 w-4 text-teal-700" />
                  Odeme islemi
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="mb-1 block">Yontem</Label>
                    <Select
                      value={paymentMethod}
                      onChange={setPaymentMethod}
                      options={paymentMethods}
                      disabled={!selectedStayId || isSubmittingPayment}
                    />
                  </div>

                  <div>
                    <Label className="mb-1 block">Tutar</Label>
                    <Input
                      ref={paymentAmountRef}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      disabled={!selectedStayId || isSubmittingPayment}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[100, 250, 500].map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setPaymentAmount(String(preset))}
                        disabled={!selectedStayId || isSubmittingPayment}
                      >
                        {preset} TL
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setPaymentAmount(String(Math.max(totals.remaining, 0).toFixed(2)))}
                      disabled={!selectedStayId || isSubmittingPayment}
                    >
                      Kalani al
                    </Button>
                  </div>

                  <div>
                    <Label className="mb-1 block">Not (opsiyonel)</Label>
                    <Textarea
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="Odeme notu"
                      className="min-h-[72px]"
                      disabled={!selectedStayId || isSubmittingPayment}
                    />
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    Odeme sonrasi tahmini bakiye:{' '}
                    <strong className={cn(projectedRemaining > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                      {money(projectedRemaining)}
                    </strong>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => {
                      void handleAddPayment()
                    }}
                    disabled={!selectedStayId || isSubmittingPayment}
                  >
                    <CreditCard className="h-4 w-4" />
                    {isSubmittingPayment ? 'Kaydediliyor...' : 'Odemeyi kaydet'}
                  </Button>

                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => {
                      void handleQuickCollectRemaining()
                    }}
                    disabled={!selectedStayId || isSubmittingPayment || totals.remaining <= 0}
                  >
                    Hizli tahsilat (kalan)
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-sm font-semibold text-slate-700">Final islemler</div>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" onClick={printSummary} disabled={!selectedStayId}>
                    <Printer className="h-4 w-4" />
                    Ozet yazdir
                  </Button>
                  <Button
                    variant={totals.remaining > 0 ? 'danger' : 'default'}
                    onClick={() => {
                      void handleCloseCheckout()
                    }}
                    disabled={!selectedStayId || isClosing}
                  >
                    {totals.remaining > 0 ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {isClosing ? 'Kapatiliyor...' : 'Checkout kapat'}
                  </Button>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Kalan bakiye varsa kapatma oncesi onay istenir.
                </p>
              </div>

              <details open={showHotkeys} className="rounded-xl border border-slate-200 bg-white p-3">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                  <Keyboard className="h-4 w-4" />
                  Klavye kisayollari
                </summary>
                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600">
                  <div>Ctrl+K: oda arama odagi</div>
                  <div>Alt+↑ / Alt+↓: onceki/sonraki oda degistir</div>
                  <div>Alt+P / Alt+N: oda degistir (geri/ileri)</div>
                  <div>Alt+O: odeme tutari odagi</div>
                  <div>Alt+1/2/3: hizli tutar (100/250/500)</div>
                  <div>Alt+0: kalan bakiyeyi yaz</div>
                  <div>Ctrl+Enter: odemeyi kaydet</div>
                  <div>Alt+T: hizli tahsilat (kalan bakiye)</div>
                  <div>Alt+C: checkout kapat</div>
                  <div>Alt+R: veriyi yenile</div>
                  <div>?: kisayol panelini ac/kapat</div>
                </div>
              </details>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
