import { useEffect, useMemo, useState } from 'react'
import { Lock, LogIn, ShieldCheck, UserRound } from 'lucide-react'
import { db } from '@/lib/supabase'
import type { Locale, StaffRole, StaffUser } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type LoginExperienceProps = {
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  onAuthenticated: (user: StaffUser) => void
}

const MAX_ATTEMPTS = 5
const LOCK_SECONDS = 60

export function LoginExperience({ locale, onLocaleChange, onAuthenticated }: LoginExperienceProps) {
  const [selectedRole, setSelectedRole] = useState<StaffRole>('resepsiyon')
  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [pin, setPin] = useState('')

  const [manualUsername, setManualUsername] = useState('')
  const [manualPin, setManualPin] = useState('')

  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)

  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [nowTick, setNowTick] = useState(() => Date.now())

  function t(tr: string, en: string) {
    return locale === 'en' ? en : tr
  }

  const roleOptions: Array<{ label: string; value: StaffRole }> = [
    { label: t('Resepsiyon', 'Reception'), value: 'resepsiyon' },
    { label: t('Servis', 'Service'), value: 'servis' },
    { label: 'Admin', value: 'admin' },
  ]

  const isLocked = useMemo(() => {
    if (!lockedUntil) return false
    return nowTick < lockedUntil
  }, [lockedUntil, nowTick])

  const lockCountdown = useMemo(() => {
    if (!lockedUntil) return 0
    const diff = Math.max(0, Math.ceil((lockedUntil - nowTick) / 1000))
    return diff
  }, [lockedUntil, nowTick])

  useEffect(() => {
    let mounted = true

    async function loadStaffByRole(role: StaffRole) {
      setIsLoadingUsers(true)
      setErrorText('')
      setSelectedUserId(null)
      setPin('')

      const res = await db
        .from('staff_users')
        .select('id,username,display_name,role,is_active')
        .eq('role', role)
        .eq('is_active', true)
        .order('display_name', { ascending: true })

      if (!mounted) return

      if (res.error) {
        setStaffList([])
        setErrorText(
          locale === 'en'
            ? 'Unable to fetch staff list. Check server connection.'
            : 'Personel listesi alinamadi. Sunucu baglantisini kontrol et.',
        )
      } else {
        const users = (res.data || []) as StaffUser[]
        setStaffList(users)
        if (users.length > 0) {
          setSelectedUserId(users[0].id)
        }
      }

      setIsLoadingUsers(false)
    }

    loadStaffByRole(selectedRole)

    return () => {
      mounted = false
    }
  }, [selectedRole, locale])

  useEffect(() => {
    if (!lockedUntil) return

    const timer = window.setInterval(() => {
      setNowTick(Date.now())
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null)
        setFailedAttempts(0)
        setErrorText('')
      }
    }, 500)

    return () => window.clearInterval(timer)
  }, [lockedUntil])

  function appendPinDigit(digit: string) {
    if (pin.length >= 6) return
    setPin((p) => `${p}${digit}`)
  }

  function handleFailedAttempt() {
    const next = failedAttempts + 1
    setFailedAttempts(next)

    if (next >= MAX_ATTEMPTS) {
      setLockedUntil(Date.now() + LOCK_SECONDS * 1000)
      setErrorText(
        locale === 'en'
          ? `Too many failed attempts. Try again in ${LOCK_SECONDS} sec.`
          : `Cok fazla hatali deneme. ${LOCK_SECONDS} sn sonra tekrar deneyin.`,
      )
      return
    }

    setErrorText(
      locale === 'en'
        ? `Wrong PIN. Remaining attempts: ${MAX_ATTEMPTS - next}`
        : `PIN hatali. Kalan deneme: ${MAX_ATTEMPTS - next}`,
    )
  }

  async function loginBySelectedUser() {
    if (isLocked) {
      setErrorText(
        locale === 'en'
          ? `Login temporarily locked. Remaining: ${lockCountdown} sec`
          : `Giris gecici kilitli. Kalan: ${lockCountdown} sn`,
      )
      return
    }

    if (!selectedUserId || pin.length < 4) {
      setErrorText(t('Lutfen personel ve en az 4 haneli PIN secin.', 'Select a staff member and enter at least a 4-digit PIN.'))
      return
    }

    setErrorText('')
    setIsSubmitting(true)

    const res = await db
      .from('staff_users')
      .select('id,username,display_name,role,is_active')
      .eq('id', selectedUserId)
      .eq('pin_code', pin)
      .eq('is_active', true)
      .maybeSingle()

    setIsSubmitting(false)

    if (res.error || !res.data) {
      setPin('')
      handleFailedAttempt()
      return
    }

    setFailedAttempts(0)
    setLockedUntil(null)
    onAuthenticated(res.data as StaffUser)
  }

  async function loginByManual() {
    if (isLocked) {
      setErrorText(
        locale === 'en'
          ? `Login temporarily locked. Remaining: ${lockCountdown} sec`
          : `Giris gecici kilitli. Kalan: ${lockCountdown} sn`,
      )
      return
    }

    if (!manualUsername || !manualPin) {
      setErrorText(t('Kullanici adi ve PIN zorunlu.', 'Username and PIN are required.'))
      return
    }

    setIsSubmitting(true)
    setErrorText('')

    const res = await db
      .from('staff_users')
      .select('id,username,display_name,role,is_active')
      .eq('username', manualUsername)
      .eq('pin_code', manualPin)
      .eq('is_active', true)
      .maybeSingle()

    setIsSubmitting(false)

    if (res.error || !res.data) {
      handleFailedAttempt()
      return
    }

    setFailedAttempts(0)
    setLockedUntil(null)
    onAuthenticated(res.data as StaffUser)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dcfce7,_transparent_42%),radial-gradient(circle_at_bottom_right,_#e0f2fe,_transparent_38%),#f8fafc] px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="overflow-hidden border-none bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 text-white">
          <CardHeader>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="neutral" className="bg-white/10 text-white">
                Hotel POS
              </Badge>
              <Badge variant="neutral" className="bg-white/10 text-white">
                {t('Hizli Giris', 'Fast Login')}
              </Badge>
              <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/20 p-1">
                <Button
                  size="sm"
                  variant={locale === 'tr' ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => onLocaleChange('tr')}
                >
                  TR
                </Button>
                <Button
                  size="sm"
                  variant={locale === 'en' ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => onLocaleChange('en')}
                >
                  EN
                </Button>
              </div>
            </div>
            <CardTitle className="font-[Space_Grotesk] text-3xl text-white md:text-4xl">
              {t("Lobiden check-out'a tek akis", 'Single flow from lobby to checkout')}
            </CardTitle>
            <CardDescription className="max-w-xl text-slate-200">
              {t(
                'Personel rolu sec, tek dokunusla giris yap ve checkout ekraninda kalan bakiyeyi net gor.',
                'Select staff role, sign in in one touch, and see remaining balance clearly at checkout.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pb-8">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="h-4 w-4" />
                {t('Login kalite hedefleri', 'Login quality goals')}
              </div>
              <ul className="space-y-1 text-sm text-slate-100">
                <li>{t('- Bilinen kullanici icin 8 sn altinda giris', '- Login under 8 seconds for known users')}</li>
                <li>{t('- Maksimum 3 aksiyon (rol, kisi, PIN)', '- Maximum 3 actions (role, user, PIN)')}</li>
                <li>{t('- Hata ve kilit durumunda anlik geri bildirim', '- Instant feedback on errors and lock state')}</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
              <p className="text-sm text-slate-100">
                {t('Demo kullanicilar:', 'Demo users:')} <strong>resepsiyon / servis / admin</strong> - PIN:{' '}
                <strong>1234</strong>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Lock className="h-5 w-5 text-teal-700" />
              {t('Personel Girisi', 'Staff Login')}
            </CardTitle>
            <CardDescription>{t('Hizli akis: rol sec, personel sec, PIN ile giris yap.', 'Fast flow: select role, select staff, login with PIN.')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {roleOptions.map((role) => (
                <Button
                  key={role.value}
                  variant={selectedRole === role.value ? 'default' : 'secondary'}
                  onClick={() => setSelectedRole(role.value)}
                  disabled={isSubmitting}
                >
                  {role.label}
                </Button>
              ))}
            </div>

            <div>
              <Label className="mb-2 block">{t('Personel', 'Staff')}</Label>
              {isLoadingUsers ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  {t('Personeller yukleniyor...', 'Loading staff...')}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {staffList.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUserId(user.id)}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-left text-sm transition',
                        selectedUserId === user.id
                          ? 'border-teal-600 bg-teal-50 text-teal-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <div className="font-semibold">{user.display_name}</div>
                      <div className="text-xs text-slate-500">@{user.username}</div>
                    </button>
                  ))}
                  {!staffList.length && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {t('Bu rol icin aktif personel bulunamadi.', 'No active staff found for this role.')}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2 block">PIN</Label>
              <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-lg font-bold tracking-[0.35em] text-slate-900">
                {(pin || '').padEnd(6, '•')}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (key === 'C') {
                        setPin('')
                      } else if (key === '⌫') {
                        setPin((p) => p.slice(0, -1))
                      } else {
                        appendPinDigit(key)
                      }
                    }}
                    disabled={isLocked || isSubmitting}
                  >
                    {key}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={loginBySelectedUser}
              disabled={isSubmitting || isLocked || !staffList.length}
            >
              <LogIn className="h-4 w-4" />
              {isSubmitting ? t('Kontrol ediliyor...', 'Validating...') : t('Giris Yap', 'Login')}
            </Button>

            <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                {t('Klasik giris (fallback)', 'Classic login (fallback)')}
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <Label className="mb-1 block">{t('Kullanici adi', 'Username')}</Label>
                  <Input
                    value={manualUsername}
                    onChange={(e) => setManualUsername(e.target.value)}
                    placeholder={t('ornek: admin', 'example: admin')}
                    disabled={isLocked || isSubmitting}
                  />
                </div>
                <div>
                  <Label className="mb-1 block">PIN</Label>
                  <Input
                    type="password"
                    value={manualPin}
                    onChange={(e) => setManualPin(e.target.value)}
                    placeholder="PIN"
                    disabled={isLocked || isSubmitting}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={loginByManual}
                  disabled={isLocked || isSubmitting}
                >
                  {t('Klasik Giris Yap', 'Login (Classic)')}
                </Button>
              </div>
            </details>

            {errorText && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {errorText}
              </div>
            )}

            {isLocked && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                {t('Giris gecici kilitli. Kalan sure', 'Login temporarily locked. Remaining')}: {lockCountdown} {t('sn', 'sec')}
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <UserRound className="h-3.5 w-3.5" />
              {t(
                'Oturum acildiginda aktif kullanici bilgisi ust barda gorunur.',
                'After login, active user details are shown in the top bar.',
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
