export const BUSINESS = {
  name: "Kamal Seller",
  brand: "IMO Recharge",
  domain: "kamalseller.shop",
  siteUrl: "https://kamalseller.shop",
  upi: {
    payeeName: "Kamal Srinivasan",
    // Paytm for Business merchant ID: accepts scanned QR codes and the Paytm app.
    merchantId: "paytm.s2sovgg@pty",
    // Personal ID (ICICI): accepts Google Pay / PhonePe / other apps opened from the site,
    // which the merchant ID rejects ("VPA not available").
    personalId: "kamal6382371168@okicici",
    // Which ID each checkout option pays to. Change here if testing shows otherwise.
    routes: { qr: "merchant", paytm: "merchant", gpay: "personal", phonepe: "personal", other: "personal" },
  },
  address:
    "S/O Srinivasan, No 19/22, Patchaiyan Kadu, Vedaranyam Taluka, Maraignanallur, Nagapattinam, Tamil Nadu 614810, India",
  // 10-digit mobile; also sent to the payment gateway when the customer gave none.
  phone: "6382371168",
  whatsappDisplay: "+91 63823 71168",
  whatsappLink: "https://wa.me/916382371168",
  imoSupportLink: "https://call.imo.im/kamalseller",
  lastUpdated: "10 October 2026",
} as const;
