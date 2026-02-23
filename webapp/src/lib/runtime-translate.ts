import type { Locale } from '@/types'

const TR_TO_EN: Array<[string, string]> = [
  ['Servis POS - Adisyon girisi', 'Service POS - Order entry'],
  ['Hedef akis: outlet sec, urunleri ekle, oda/yuruyen sec, adisyonu tek adimda kaydet.', 'Target flow: select outlet, add items, choose room/walk-in, save in one step.'],
  ['Aktif personel', 'Active staff'],
  ['Hesap tipi', 'Account type'],
  ['Oda hesabi', 'Room account'],
  ['Yuruyen musteri', 'Walk-in guest'],
  ['Konaklama secimi', 'Stay selection'],
  ['Oda no veya misafir ara', 'Search room no or guest'],
  ['Aktif konaklama yok', 'No active stay'],
  ['Onceki oda', 'Previous room'],
  ['Sonraki oda', 'Next room'],
  ['Urun veya kategori ara (kisa yol: /)', 'Search item or category (shortcut: /)'],
  ['Tum kategoriler', 'All categories'],
  ['Secilen filtreye uygun menu urunu yok.', 'No menu item matches the selected filter.'],
  ['Adisyon sepeti', 'Order cart'],
  ['Hedef: maksimum 45 sn icinde urun secimi ve adisyonu kaydetme.', 'Goal: select items and save order within 45 sec.'],
  ['Hesap sahibi', 'Account holder'],
  ['Konaklama secilmedi', 'No stay selected'],
  ['Sepet bos. Urun kartina tiklayarak ekleyin.', 'Cart is empty. Click an item card to add.'],
  ['Adisyon notu', 'Order note'],
  ['Orn: az tuzlu, buzsuz', 'Ex: less salt, no ice'],
  ['Toplam', 'Total'],
  ['Kaydediliyor...', 'Saving...'],
  ['Kaydet + yazdir (Ctrl+Enter)', 'Save + print (Ctrl+Enter)'],
  ['Kaydet (yazdirma yok)', 'Save (no print)'],
  ['Sepeti temizle (Alt+Backspace)', 'Clear cart (Alt+Backspace)'],
  ['POS kisayollari', 'POS shortcuts'],
  ['/ : menu arama odagi', '/ : menu search focus'],
  ['Ctrl+K : oda arama odagi', 'Ctrl+K : room search focus'],
  ['Alt+R : Oda hesabi modu', 'Alt+R : room account mode'],
  ['Alt+W : Yuruyen musteri modu', 'Alt+W : walk-in mode'],
  ['Alt+↑ / Alt+↓ : oda degistir', 'Alt+↑ / Alt+↓ : change room'],
  ['Ctrl+Enter : kaydet + yazdir', 'Ctrl+Enter : save + print'],
  ['Alt+Backspace : sepeti temizle', 'Alt+Backspace : clear cart'],
  ['? : kisayol paneli ac/kapat', '? : toggle shortcut panel'],
  ['Son kayitli adisyonlar', 'Latest receipts'],
  ['Son 15 adisyon - servis kontrolu icin hizli gorunum.', 'Last 15 receipts - quick control view.'],
  ['Henuz adisyon yok.', 'No receipts yet.'],
  ['Yuruyen', 'Walk-in'],
  ['Oda', 'Room'],
  ['Checkout workspace', 'Checkout workspace'],
  ['Oda secimi', 'Room selection'],
  ['Oda numarasi veya misafir adi ile hizli arama yap.', 'Quick search by room number or guest name.'],
  ['Oda no veya misafir adi...', 'Room no or guest name...'],
  ['Bu kritere uygun oda bulunamadi.', 'No rooms found for this criteria.'],
  ['Konaklamalar yukleniyor...', 'Loading stays...'],
  ['Folio satirlari', 'Folio lines'],
  ['Folio hareketleri yukleniyor...', 'Loading folio entries...'],
  ['Bu konaklama icin adisyon kaydi yok.', 'No orders for this stay.'],
  ['Odeme gecmisi', 'Payment history'],
  ['Henuz odeme girilmedi.', 'No payment yet.'],
  ['Duzelt', 'Edit'],
  ['Iptal', 'Cancel'],
  ['Not:', 'Note:'],
  ['Odeme audit logu', 'Payment audit log'],
  ['Audit kaydi bulunamadi.', 'No audit logs found.'],
  ['once:', 'before:'],
  ['sonra:', 'after:'],
  ['Neden:', 'Reason:'],
  ['Toplamlar', 'Totals'],
  ['Toplam Harcama', 'Total Charges'],
  ['Toplam Odeme', 'Total Payments'],
  ['Kalan Bakiye', 'Remaining Balance'],
  ['Odeme duzeltme', 'Payment adjustment'],
  ['Yeni yontem', 'New method'],
  ['Yeni tutar', 'New amount'],
  ['Duzeltme nedeni', 'Adjustment reason'],
  ['Vazgec', 'Cancel'],
  ['Duzeltmeyi kaydet', 'Save adjustment'],
  ['Odeme islemi', 'Payment'],
  ['Yontem', 'Method'],
  ['Tutar', 'Amount'],
  ['Kalani al', 'Take remaining'],
  ['Not (opsiyonel)', 'Note (optional)'],
  ['Odeme notu', 'Payment note'],
  ['Odeme sonrasi tahmini bakiye:', 'Estimated remaining after payment:'],
  ['Odemeyi kaydet', 'Save payment'],
  ['Hizli tahsilat (kalan)', 'Quick collect (remaining)'],
  ['Final islemler', 'Final actions'],
  ['Ozet yazdir', 'Print summary'],
  ['Checkout kapat', 'Close checkout'],
  ['Kalan bakiye varsa kapatma oncesi onay istenir.', 'If there is remaining balance, confirmation is required before close.'],
  ['Klavye kisayollari', 'Keyboard shortcuts'],
  ['Ctrl+K: oda arama odagi', 'Ctrl+K: room search focus'],
  ['Alt+↑ / Alt+↓: onceki/sonraki oda degistir', 'Alt+↑ / Alt+↓: previous/next room'],
  ['Alt+P / Alt+N: oda degistir (geri/ileri)', 'Alt+P / Alt+N: room change (prev/next)'],
  ['Alt+O: odeme tutari odagi', 'Alt+O: payment amount focus'],
  ['Alt+1/2/3: hizli tutar (100/250/500)', 'Alt+1/2/3: quick amount (100/250/500)'],
  ['Alt+0: kalan bakiyeyi yaz', 'Alt+0: fill remaining balance'],
  ['Ctrl+Enter: odemeyi kaydet', 'Ctrl+Enter: save payment'],
  ['Alt+T: hizli tahsilat (kalan bakiye)', 'Alt+T: quick collect (remaining)'],
  ['Alt+C: checkout kapat', 'Alt+C: close checkout'],
  ['Alt+R: veriyi yenile', 'Alt+R: refresh data'],
  ['?: kisayol panelini ac/kapat', '?: toggle shortcuts'],
  ['Thermal Fis Onizleme', 'Thermal Receipt Preview'],
  ['Yaziciya Gonder', 'Send to Printer'],
  ['Kapat', 'Close'],
  ['HOTEL POS ADISYON', 'HOTEL POS RECEIPT'],
  ['Tarih', 'Date'],
  ['Hesap', 'Account'],
  ['Urun', 'Item'],
  ['Adet', 'Qty'],
  ['TOPLAM', 'TOTAL'],
  ['Tesekkurler', 'Thank you'],
  ['Acik konaklamalar', 'Open stays'],
  ['Son siparisler', 'Recent orders'],
  ['Bugunku siparis', "Today's orders"],
  ['Bugunku ciro', "Today's revenue"],
  ['Acik konaklama', 'Open stays'],
  ['Acik bakiye', 'Open balance'],
  ['Raporu yenile', 'Refresh report'],
  ['Yenileniyor...', 'Refreshing...'],
  ['Cikis', 'Logout'],
  ['Konaklamalar', 'Stays'],
  ['Siparisler', 'Orders'],
  ['Raporlar', 'Reports'],
]

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function applyMap(text: string, map: Array<[string, string]>) {
  let output = text
  for (const [from, to] of map) {
    output = output.replace(new RegExp(escapeRegExp(from), 'g'), to)
  }
  return output
}

export function applyRuntimeTranslation(root: ParentNode, locale: Locale) {
  const map = locale === 'en' ? TR_TO_EN : TR_TO_EN.map(([tr, en]) => [en, tr] as [string, string])

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.nextNode()
  while (node) {
    const parent = node.parentElement
    const blocked = parent?.tagName === 'SCRIPT' || parent?.tagName === 'STYLE'
    if (!blocked && node.nodeValue) {
      const next = applyMap(node.nodeValue, map)
      if (next !== node.nodeValue) {
        node.nodeValue = next
      }
    }
    node = walker.nextNode()
  }

  const elements = root.querySelectorAll<HTMLElement>('[placeholder], [title]')
  elements.forEach((el) => {
    const placeholder = el.getAttribute('placeholder')
    const title = el.getAttribute('title')
    if (placeholder) {
      const next = applyMap(placeholder, map)
      if (next !== placeholder) el.setAttribute('placeholder', next)
    }
    if (title) {
      const next = applyMap(title, map)
      if (next !== title) el.setAttribute('title', next)
    }
  })
}
