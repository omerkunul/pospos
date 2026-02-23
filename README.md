# Hotel POS & Folio (Supabase Web MVP)

Kurulum gerektirmeyen (build adımı yok) statik web uygulaması.

## Özellikler
- Personel girişi ve rol bazlı ekran yetkisi
  - `resepsiyon`: Check-in, Checkout, Raporlar
  - `servis`: POS, Raporlar
  - `admin`: Tüm ekranlar
- Check-in: misafir + oda ile konaklama açma
- POS: outlet seç, adisyon oluştur, odaya yaz veya yürüyen müşteri
- Fiş yazdırma: `window.print()` thermal fiş şablonu
- Checkout: folio toplamı, çoklu ödeme tipi, konaklama kapatma
- Günlük rapor: satış, tahsilat, outlet dağılımı, ödeme dağılımı, oda harcaması, açık alacaklar

## 1) Supabase şemasını kur
Supabase SQL Editor'a `sql/schema.sql` içeriğini yapıştırıp çalıştır.

Bu SQL dosyası demo kullanıcıları da oluşturur:
- kullanıcı: `resepsiyon` pin: `1234`
- kullanıcı: `servis` pin: `1234`
- kullanıcı: `admin` pin: `1234`

## 2) Supabase config
`static/config.js` dosyası Supabase URL ve anon key içermelidir.

## 3) Lokalde çalıştır
```bash
cd /Users/omerkunul/github_code/restaurant-pos-system/static
python3 -m http.server 8085 --bind 0.0.0.0
```

Tarayıcıdan aç:
- `http://localhost:8085`
- aynı ağdan test için: `http://<sunucu_ip>:8085`

Not: Eğer `8085` doluysa farklı port kullanın (ör. `8092`).

## 4) Demo veri doldur (opsiyonel ama önerilir)
Bu script:
- 15 demo misafir + konaklama
- örnek sipariş/ödeme hareketleri
- web API'lerinden gerçek yemek/içecek görselleri ile menü

```bash
cd /Users/omerkunul/github_code/restaurant-pos-system
DATABASE_URL='postgresql://USER:PASS@HOST:PORT/DB' python3 scripts/seed_demo_data.py
```

## 5) Modern UI (React + shadcn-style)
Yeni login ve checkout UX bu arayuzde:

```bash
cd /Users/omerkunul/github_code/restaurant-pos-system/webapp
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

Tarayici:
- `http://localhost:5174`

Bu arayuzde ek ozellikler:
- Oda degistirme kisayollari (onceki/sonraki oda)
- Hizli tahsilat (kalan bakiyeyi tek tikla alma)
- Klavye-only checkout kisayollari (Ctrl+K, Alt+Oklar, Ctrl+Enter vb.)
- Odeme iptal/duzeltme ve `payment_audit_logs` uzerinden audit takibi
- Modern menu yonetim paneli (ekle/duzenle/aktif-pasif + gorsel URL)

Uretim build:
```bash
npm run build
```

## Notlar
- Bu MVP'de vergi hesabı yoktur.
- Ödeme yöntemleri: `nakit`, `kart`, `havale`, `diger`.
- Sessiz/raw thermal print istenirse sonraki fazda `QZ Tray` veya `PrintNode` eklenebilir.
- `sql/schema.sql` içindeki RLS policy'ler demo amaçlı açık bırakılmıştır. Canlıda mutlaka sıkılaştırın.
