import { RechargeOrder, RechargePackage } from "./types";

export const RECHARGE_PACKAGES: RechargePackage[] = [
  { id: "pkg-10", credits: 10, price: 30, active: true, order: 1 },
  { id: "pkg-50", credits: 50, price: 90, active: true, order: 2 },
  { id: "pkg-100", credits: 100, price: 176, active: true, order: 3 },
  { id: "pkg-200", credits: 200, price: 352, active: true, order: 4 },
  { id: "pkg-300", credits: 300, price: 528, active: true, order: 5 },
  { id: "pkg-500", credits: 500, price: 881, active: true, order: 6 },
  { id: "pkg-600", credits: 600, price: 1056, active: true, order: 7 },
  { id: "pkg-800", credits: 800, price: 1408, active: true, order: 8 },
  { id: "pkg-1000", credits: 1000, price: 1760, active: true, order: 9 },
  { id: "pkg-2000", credits: 2000, price: 3520, active: true, order: 10 },
  { id: "pkg-3000", credits: 3000, price: 5280, active: true, order: 11 },
  { id: "pkg-5000", credits: 5000, price: 8750, active: true, order: 12 },
  { id: "pkg-10000", credits: 10000, price: 17500, active: true, order: 13 },
];

export const DEMO_ORDERS: RechargeOrder[] = [
  {
    id: "IMO-10241",
    profileId: "123456789",
    packageLabel: "100 Credits",
    credits: 100,
    quantity: 1,
    amount: 339,
    paymentStatus: "paid",
    rechargeStatus: "completed",
    createdAt: "2026-10-05T17:00:00+05:30",
  },
  {
    id: "IMO-10198",
    profileId: "123456789",
    packageLabel: "50 Credits",
    credits: 50,
    quantity: 1,
    amount: 179,
    paymentStatus: "paid",
    rechargeStatus: "processing",
    createdAt: "2026-09-28T12:15:00+05:30",
  },
];
