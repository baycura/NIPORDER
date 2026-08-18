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

- **Yönetici** — etkinlik/kişi/ürün ekler, düzenler, siler; tüm etkinlikleri görür.
- **Ekip** — yalnızca atandığı etkinlikleri görür; rider tikler, not ve görev
  ekler, arıza kaydeder. Ana kayıtları değiştiremez.

Başlangıç PIN'leri: Levent `1234` (yönetici) · Ömer `1111` · Berkay `2222` ·
Sadi `3333` · Emir `4444`. Yönetici > Ekip'ten değiştirilir.

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
