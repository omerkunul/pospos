export type Locale = 'tr' | 'en'

export type StaffRole = 'resepsiyon' | 'servis' | 'admin'

export type StaffUser = {
  id: number
  username: string
  display_name: string
  role: StaffRole
  is_active: boolean
}

export type Outlet = {
  id: number
  name: string
}

export type StayListItem = {
  id: number
  check_in: string
  check_out_plan: string | null
  room: {
    id: number
    room_number: string
  } | null
  guest: {
    id: number
    full_name: string
    phone: string | null
  } | null
  balance: number
}

export type OrderRow = {
  id: number
  created_at: string
  note: string | null
  outlet_id: number
}

export type OrderItemRow = {
  order_id: number
  item_name: string
  quantity: number
  unit_price: number
}

export type PaymentRow = {
  id: number
  stay_id: number
  method: string
  amount: number
  entry_type?: 'payment' | 'reversal' | 'adjustment'
  reference_payment_id?: number | null
  note: string | null
  created_at: string
}

export type MenuItem = {
  id: number
  outlet_id: number
  name: string
  category: string
  price: number
  image_url: string | null
  is_active: boolean
}

export type PaymentAuditLog = {
  id: number
  stay_id: number
  payment_id: number | null
  action: 'cancel' | 'edit'
  old_amount: number | null
  new_amount: number | null
  old_method: string | null
  new_method: string | null
  reason: string | null
  actor_user_id: number | null
  metadata: Record<string, unknown> | null
  created_at: string
}
