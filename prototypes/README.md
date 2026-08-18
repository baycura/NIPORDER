# Prototipler

Bu klasördeki dosyalar NIP Order uygulamasının parçası değildir; tek başına
çalışan uygulamalardır. Vite yalnızca kökteki `index.html`'i derlediği için
buradaki dosyalar üretim çıktısına dahil olmaz.

## ari-app.html — ARI Saha

ARI Müzik'in saha işleri için tek dosyalık uygulama: takvim, etkinlik rider'ı,
görevler ve envanter. Bağımlılık yok — tarayıcıda doğrudan açılır.

### Çalışma kipleri

| Nerede açıldığı | Veri nerede |
|---|---|
| Claude Artifact olarak yayımlanmış bağlantı | Sayfanın kendi içinde. Bağlantıyı açan herkes aynı kayıtları görür; yazma yetkisi olanlar değiştirir. |
| Dosyadan / yerelden | O cihazın `localStorage`'ında (`ari.*`). Cihazlar arası paylaşım yok. |

Yayım kipinde her değişiklik sayfayı yeni bir sürüm olarak yeniden yayımlar
(yazmalar ~1 sn içinde toplanır) ve açık olan tüm görünümler tazelenir.

### Roller

Etkinliklerin tamamını **herkes görür** — hazırlık depoda birlikte yapıldığı ve
planlama buna göre kurulduğu için. Kendi atandığın işler listelerde "sen"
rozetiyle, takvimde kalın sarı çizgiyle ayrışır.

- **Yönetici** — etkinlik/kişi/ürün ekler, düzenler, siler.
- **Ekip** — her etkinlikte rider tikler, not ve görev ekler, arıza kaydeder,
  yüklendi/döndü işaretler. Ana kayıtları (etkinlik, kişi, ürün) değiştiremez.

Başlangıç PIN'leri: Levent `1234` (yönetici) · Ömer `1111` · Berkay `2222` ·
Sadi `3333` · Emir `4444` · Bolat `5555`. Yönetici > Ekip'ten değiştirilir.

### Görev puanı (yalnızca yönetici görür)

Görevler bir kişiye atanabilir ya da **ortaya** bırakılabilir. Tamamlanan her
görev puan üretir:

| Durum | Puan |
|---|---|
| İsme atanan işi sahibi yaptı | 1 |
| İsme atanan işi başkası devraldı | 2 |
| Ortaya atılan işi biri aldı | 3 |

Puanlar Yönetici > Verimlilik'te sıralı olarak görünür; ekip hiçbir yerde puan
görmez. Görev geri alınırsa puan da düşer (değer saklanmaz, hesaplanır).
Kırılımda "kendi açtığı" sayısı da yazar — biri kendi açtığı işleri kapatarak
puan biriktiriyorsa orada görünür.

### Envanter kuralı

"Sahada" adedi elle girilmez. Bir etkinlik **Yüklendi** işaretlenince rider'ındaki
ekipman stoktan düşer; **Döndü** işaretlenince geri gelir. Böylece "müsait adet"
her zaman gerçek durumu gösterir ve rider'a stokta olmayan miktar yazılırsa uyarı
çıkar.

### Bilinmesi gerekenler

- PIN'ler istemci tarafında saklanır. Bu, ekip içinde kim ne yaptı ayrımı içindir;
  bağlantıyı ele geçiren birine karşı koruma değildir. Bağlantıyı yalnızca ekiple
  paylaşın.
- Yönetici > Veri'den örnek etkinlik yüklenip silinebilir, her şey sıfırlanabilir.
