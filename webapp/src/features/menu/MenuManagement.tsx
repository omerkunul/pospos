import { useEffect, useMemo, useState } from 'react'
import { ImageIcon, PackagePlus, Search, ToggleLeft, ToggleRight } from 'lucide-react'
import { db } from '@/lib/supabase'
import type { Locale, MenuItem, Outlet } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} TL`
}

type MenuManagementProps = {
  locale: Locale
  onToast: (message: string, type?: 'success' | 'error') => void
}

const CATEGORY_OPTIONS = [
  'Burger',
  'Pizza',
  'Ana Yemek',
  'Atistirmalik',
  'Alkolsuz Icecek',
  'Alkollu Icecek',
  'Tatli',
  'Genel',
]

const fallbackImage =
  'https://www.themealdb.com/images/media/meals/1548772327.jpg'

export function MenuManagement({ locale, onToast }: MenuManagementProps) {
  const [items, setItems] = useState<MenuItem[]>([])
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [filterOutlet, setFilterOutlet] = useState('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'passive'>('all')

  const [newOutletId, setNewOutletId] = useState('')
  const [newCategory, setNewCategory] = useState('Burger')
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('Genel')
  const [editPrice, setEditPrice] = useState('')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [editOutletId, setEditOutletId] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  function t(tr: string, en: string) {
    return locale === 'en' ? en : tr
  }

  function categoryLabel(value: string) {
    if (locale !== 'en') return value

    const map: Record<string, string> = {
      Burger: 'Burger',
      Pizza: 'Pizza',
      'Ana Yemek': 'Main Course',
      Atistirmalik: 'Snacks',
      'Alkolsuz Icecek': 'Soft Drink',
      'Alkollu Icecek': 'Alcoholic Drink',
      Tatli: 'Dessert',
      Genel: 'General',
    }

    return map[value] || value
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()

    return items.filter((item) => {
      const byQuery = !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
      const byOutlet = filterOutlet === 'all' || String(item.outlet_id) === filterOutlet
      const byStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && item.is_active) ||
        (filterStatus === 'passive' && !item.is_active)

      return byQuery && byOutlet && byStatus
    })
  }, [items, search, filterOutlet, filterStatus])

  const outletOptions = useMemo(
    () => outlets.map((outlet) => ({ value: String(outlet.id), label: outlet.name })),
    [outlets],
  )

  async function loadData() {
    setIsLoading(true)

    const [outletsRes, itemsRes] = await Promise.all([
      db.from('outlets').select('id,name').order('name', { ascending: true }),
      db
        .from('menu_items')
        .select('id,outlet_id,name,category,price,image_url,is_active')
        .order('name', { ascending: true }),
    ])

    setIsLoading(false)

    if (outletsRes.error || itemsRes.error) {
      onToast(outletsRes.error?.message || itemsRes.error?.message || t('Menu verisi alinamadi.', 'Unable to fetch menu data.'), 'error')
      return
    }

    const outletRows = (outletsRes.data || []) as Outlet[]
    const itemRows = (itemsRes.data || []) as MenuItem[]

    setOutlets(outletRows)
    setItems(itemRows)

    if (!newOutletId && outletRows.length > 0) {
      setNewOutletId(String(outletRows[0].id))
    }
  }

  useEffect(() => {
    loadData().catch((err: Error) => onToast(err.message, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startEdit(item: MenuItem) {
    setEditId(item.id)
    setEditName(item.name)
    setEditCategory(item.category || 'Genel')
    setEditPrice(String(item.price))
    setEditImageUrl(item.image_url || '')
    setEditOutletId(String(item.outlet_id))
  }

  function cancelEdit() {
    setEditId(null)
    setEditName('')
    setEditCategory('Genel')
    setEditPrice('')
    setEditImageUrl('')
    setEditOutletId('')
  }

  async function createItem() {
    const outletId = Number(newOutletId)
    const price = Number(newPrice)

    if (!outletId || !newName.trim() || Number.isNaN(price) || price < 0) {
      onToast(t('Yeni urun icin alanlari kontrol edin.', 'Check the fields for the new item.'), 'error')
      return
    }

    setIsCreating(true)

    const res = await db.from('menu_items').insert({
      outlet_id: outletId,
      name: newName.trim(),
      category: newCategory,
      price,
      image_url: newImageUrl.trim() || null,
      is_active: true,
    })

    setIsCreating(false)

    if (res.error) {
      onToast(res.error.message, 'error')
      return
    }

    setNewName('')
    setNewPrice('')
    setNewImageUrl('')
    setNewCategory('Burger')
    onToast(t('Menu urunu eklendi.', 'Menu item added.'), 'success')
    await loadData()
  }

  async function saveEdit() {
    if (!editId) return

    const outletId = Number(editOutletId)
    const price = Number(editPrice)

    if (!outletId || !editName.trim() || Number.isNaN(price) || price < 0) {
      onToast(t('Duzenleme alanlarini kontrol edin.', 'Check edit fields.'), 'error')
      return
    }

    setIsSavingEdit(true)

    const res = await db
      .from('menu_items')
      .update({
        outlet_id: outletId,
        name: editName.trim(),
        category: editCategory,
        price,
        image_url: editImageUrl.trim() || null,
      })
      .eq('id', editId)

    setIsSavingEdit(false)

    if (res.error) {
      onToast(res.error.message, 'error')
      return
    }

    onToast(t('Urun guncellendi.', 'Item updated.'), 'success')
    cancelEdit()
    await loadData()
  }

  async function toggleItemStatus(item: MenuItem) {
    const res = await db
      .from('menu_items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id)

    if (res.error) {
      onToast(res.error.message, 'error')
      return
    }

    onToast(
      item.is_active ? t('Urun pasife alindi.', 'Item deactivated.') : t('Urun tekrar aktive edildi.', 'Item activated again.'),
      'success',
    )
    await loadData()
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PackagePlus className="h-5 w-5 text-teal-700" />
            {t('Menu yonetimi', 'Menu management')}
          </CardTitle>
          <CardDescription>
            {t(
              'Urun ekle, duzenle, aktive/pasife al. Gorsel URL ile menu kartlarini zenginlestir.',
              'Add, edit, activate/deactivate items. Use image URLs to enrich menu cards.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-1">
            <Label className="mb-1 block">Outlet</Label>
            <Select
              value={newOutletId}
              onChange={setNewOutletId}
              options={outletOptions}
              disabled={!outletOptions.length || isCreating}
            />
          </div>
          <div className="xl:col-span-1">
            <Label className="mb-1 block">{t('Kategori', 'Category')}</Label>
            <Select
              value={newCategory}
              onChange={setNewCategory}
              options={CATEGORY_OPTIONS.map((opt) => ({ value: opt, label: categoryLabel(opt) }))}
              disabled={isCreating}
            />
          </div>
          <div className="xl:col-span-2">
            <Label className="mb-1 block">{t('Urun adi', 'Item name')}</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('Orn: Truffle Burger', 'Ex: Truffle Burger')}
              disabled={isCreating}
            />
          </div>
          <div className="xl:col-span-1">
            <Label className="mb-1 block">{t('Fiyat', 'Price')}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="0.00"
              disabled={isCreating}
            />
          </div>
          <div className="xl:col-span-6">
            <Label className="mb-1 block">{t('Gorsel URL (opsiyonel)', 'Image URL (optional)')}</Label>
            <Input
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              placeholder="https://..."
              disabled={isCreating}
            />
          </div>
          <div className="xl:col-span-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ImageIcon className="h-3.5 w-3.5" />
              {t('Gorsel bos birakilirsa varsayilan urun gorseli kullanilir.', 'If image is empty, the default item image is used.')}
            </div>
            <Button onClick={createItem} disabled={isCreating}>
              {isCreating ? t('Ekleniyor...', 'Adding...') : t('Urun ekle', 'Add item')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader>
          <CardTitle>{t('Mevcut menu', 'Current menu')}</CardTitle>
          <CardDescription>{t('Arama, filtre ve satir bazli hizli duzenleme.', 'Search, filtering and row-based quick edit.')}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative md:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Urun veya kategori ara', 'Search item or category')}
              />
            </div>
            <Select
              value={filterOutlet}
              onChange={setFilterOutlet}
              options={[{ value: 'all', label: t('Tum outletler', 'All outlets') }, ...outletOptions]}
            />
            <Select
              value={filterStatus}
              onChange={(value) => setFilterStatus(value as 'all' | 'active' | 'passive')}
              options={[
                { value: 'all', label: t('Tum durumlar', 'All statuses') },
                { value: 'active', label: t('Sadece aktif', 'Active only') },
                { value: 'passive', label: t('Sadece pasif', 'Inactive only') },
              ]}
            />
          </div>

          {isLoading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              {t('Menu yukleniyor...', 'Loading menu...')}
            </div>
          )}

          <div className="grid min-h-0 flex-1 auto-rows-max gap-3 overflow-auto pr-1 lg:grid-cols-2">
            {filteredItems.map((item) => {
              const isEditing = editId === item.id
              const outletName = outlets.find((outlet) => outlet.id === item.outlet_id)?.name || '-'

              return (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex gap-3">
                    <img
                      src={item.image_url || fallbackImage}
                      alt={item.name}
                      className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">
                        {categoryLabel(item.category)} · {outletName}
                      </div>
                      <div className="text-sm font-semibold text-slate-800">{money(item.price)}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleItemStatus(item)}
                      title={item.is_active ? t('Pasife al', 'Deactivate') : t('Aktif et', 'Activate')}
                    >
                      {item.is_active ? (
                        <ToggleRight className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-slate-400" />
                      )}
                    </Button>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={editCategory}
                          onChange={setEditCategory}
                          options={CATEGORY_OPTIONS.map((opt) => ({ value: opt, label: categoryLabel(opt) }))}
                        />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                        />
                      </div>
                      <Select
                        value={editOutletId}
                        onChange={setEditOutletId}
                        options={outletOptions}
                      />
                      <Input
                        value={editImageUrl}
                        onChange={(e) => setEditImageUrl(e.target.value)}
                        placeholder={t('Gorsel URL', 'Image URL')}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" onClick={cancelEdit}>
                          {t('Vazgec', 'Cancel')}
                        </Button>
                        <Button onClick={saveEdit} disabled={isSavingEdit}>
                          {isSavingEdit ? t('Kaydediliyor...', 'Saving...') : t('Kaydet', 'Save')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">
                        {t('Durum', 'Status')}:{' '}
                        <span className={item.is_active ? 'text-emerald-600' : 'text-rose-600'}>
                          {item.is_active ? t('Aktif', 'Active') : t('Pasif', 'Inactive')}
                        </span>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => startEdit(item)}>
                        {t('Duzenle', 'Edit')}
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!isLoading && !filteredItems.length && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              {t('Filtreye uygun urun bulunamadi.', 'No menu items match the filter.')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
