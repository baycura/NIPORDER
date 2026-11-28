// GORUNEN UNVAN — personelin adinin altinda yazan ad (staff.display_role).
// Bos ise ROLUN adi gosterilir. Eskiden her yerde "Yönetici" yaziyordu;
// unvani bos kalan garson ve part-time da "YÖNETİCİ" gorunuyordu.
export const ROL_ADI = {
  admin: "Sahip", owner: "Sahip", super_admin: "Sahip",
  manager: "Yönetici", waiter: "Garson/Kasiyer", cashier: "Garson/Kasiyer",
  kitchen: "Mutfak", parttime: "Part-time", viewer: "Gözlemci",
};
export const varsayilanUnvan = (rol) => ROL_ADI[rol] || "Personel";
export const gorunenUnvan = (kisi) => String(kisi?.display_role || "").trim() || varsayilanUnvan(kisi?.role);
