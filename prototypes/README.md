# Prototipler

Bu klasördeki dosyalar NIP Order uygulamasının parçası değildir; tek başına
çalışan tasarım prototipleridir. Vite yalnızca kökteki `index.html`'i derlediği
için buradaki dosyalar üretim çıktısına dahil olmaz.

## ari-app.html

ARI ekip uygulamasının tek dosyalık prototipi (takvim · görevler · envanter).
Tarayıcıda doğrudan açılır; React ve Babel CDN'den yüklenir, kurulum gerekmez.

**Demo PIN'leri** — Ömer `1111` · Berkay `2222` · Sadi `3333` · Emir `4444`,
yönetici (Levent) `1234`.

**Bilinmesi gerekenler**
- Veri sunucuda değil, tarayıcının `localStorage`'ında tutulur (`ari:*`
  anahtarları). Cihazlar arası paylaşım yoktur; sıfırlamak için site verisini
  temizlemek yeterlidir.
- Demo etkinlikleri açılışta içinde bulunulan aya yerleştirilir, böylece takvim
  ve "Yaklaşan" listesi her zaman dolu görünür. Diğer aylar boştur.
- Yönetici panelindeki beş kart henüz ekransızdır; "yakında" olarak işaretlidir.
- PIN'ler istemci tarafında sabittir — gerçek kimlik doğrulama değildir.
