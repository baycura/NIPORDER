// Gorsel yukleme yardimcilari — "sistemi yavaslatmasin" kurali burada yasar.
//
// Telefon fotografi 3-6 MB gelir. QR menu bunu 70 px'lik kucuk kare (raf
// urunu) ya da 230 px yukseklik (blog) olarak gosteriyor. Oldugu gibi
// yuklemek hem depolamayi sisirir hem musterinin menusunu yavaslatir.
// Yuklemeden once tarayicida kucultuyoruz; sunucuya kucuk dosya gidiyor,
// musteriye kucuk dosya iniyor. Kucultme basarisiz olursa (HEIC gibi
// tarayicinin cozemedigi bicim) dosya oldugu gibi gider — ozellik, kapi degil.

// En uzun kenari enUzun px'e indir, JPEG olarak dondur.
export const kucult = (file, { enUzun = 1000, kalite = 0.82 } = {}) => new Promise((resolve) => {
  if (!file || !/^image\//.test(file.type)) return resolve(file);
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const oran = Math.min(1, enUzun / Math.max(img.width, img.height));
    // Zaten kucuk ve JPEG ise dokunma; PNG/HEIC ise yine JPEG'e cevir (boyut).
    if (oran === 1 && file.type === "image/jpeg" && file.size < 200 * 1024) return resolve(file);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * oran));
    c.height = Math.max(1, Math.round(img.height * oran));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return resolve(file);
      resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
    }, "image/jpeg", kalite);
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
  img.src = url;
});

// Kucult + Storage'a yukle + herkese acik URL'i dondur. Hata varsa firlatir.
export async function gorselYukle(supabase, file, klasor, secenekler) {
  const f = await kucult(file, secenekler);
  const ad = f.name.replace(/[^a-zA-Z0-9.]/g, "_");
  const path = klasor.replace(/\/+$/, "") + "/" + Date.now() + "_" + ad;
  const { error } = await supabase.storage.from("product-images").upload(path, f, { contentType: f.type || undefined });
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("URL alınamadı");
  return data.publicUrl;
}
