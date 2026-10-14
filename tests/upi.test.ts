import { describe, expect, it } from "vitest";
import { buildUpiLink, formatPaise, normalizeUtr, toPaise } from "@/lib/upi";
import { parseAmountPaise, parsePaymentMessage } from "@/lib/upi-message";

const request = { vpa: "paytm.s2sovgg@pty", payeeName: "Kamal Seller", amountPaise: 2937, note: "IMO-ABCDE12345" };

describe("buildUpiLink", () => {
  it("prefills payee, exact amount and order note", () => {
    expect(buildUpiLink(request)).toBe(
      "upi://pay?pa=paytm.s2sovgg@pty&pn=Kamal%20Seller&am=29.37&cu=INR&tn=IMO-ABCDE12345"
    );
  });
  it("matches the link format verified with real payments", () => {
    expect(buildUpiLink({ ...request, payeeName: "Kamal Srinivasan", amountPaise: 100, note: "IMO-TEST000001" })).toBe(
      "upi://pay?pa=paytm.s2sovgg@pty&pn=Kamal%20Srinivasan&am=1.00&cu=INR&tn=IMO-TEST000001"
    );
  });
  it("rejects a malformed UPI ID or amount", () => {
    expect(() => buildUpiLink({ ...request, vpa: "bad&pa=evil@upi" })).toThrow();
    expect(() => buildUpiLink({ ...request, amountPaise: 0 })).toThrow();
    expect(() => buildUpiLink({ ...request, amountPaise: 10.5 })).toThrow();
  });
  it("cannot inject extra parameters through the note or name", () => {
    const link = buildUpiLink({ ...request, payeeName: "A&am=1", note: "x&pa=evil@upi" });
    expect(link.match(/&am=/g)).toHaveLength(1);
    expect(link.match(/[?&]pa=/g)).toHaveLength(1);
  });
});

describe("amount and UTR helpers", () => {
  it("converts between rupees and paise without float drift", () => {
    expect(toPaise(29.37)).toBe(2937);
    expect(toPaise("1056.01")).toBe(105601);
    expect(formatPaise(2937)).toBe("29.37");
    expect(formatPaise(3000)).toBe("30.00");
  });
  it("accepts only 12-digit UTRs", () => {
    expect(normalizeUtr(" 4123 5678 9012 ")).toBe("412356789012");
    expect(normalizeUtr("12345")).toBeNull();
    expect(normalizeUtr("41235678901a")).toBeNull();
  });
  it("parses rupee amounts", () => {
    expect(parseAmountPaise("1,056.5")).toBe(105650);
    expect(parseAmountPaise("29")).toBe(2900);
    expect(parseAmountPaise("0")).toBeNull();
    expect(parseAmountPaise("1.234")).toBeNull();
  });
});

describe("parsePaymentMessage", () => {
  it.each([
    ["Received ₹29.37 from Ramesh Kumar", 2937, null, "Ramesh Kumar"],
    ["Payment Received - ₹1,056.42 received from ramesh@okaxis. UPI Ref No: 412345678901", 105642, "412345678901", "ramesh@okaxis"],
    ["Rs.29.37 credited to your Paytm for Business account on 14-10-26. UTR 412345678901", 2937, "412345678901", null],
    ["INR 87.12 received via UPI. Ref no. 512345678901", 8712, "512345678901", null],
  ])("reads a credit: %s", (text, amountPaise, utr, payer) => {
    expect(parsePaymentMessage(text)).toEqual({ isCredit: true, amountPaise, utr, payer });
  });

  it.each([
    "Rs.500 debited from your account. UPI Ref 412345678901",
    "₹29.37 sent to Ramesh Kumar",
    "Payment request from Ramesh for ₹29.37",
    "Refund of ₹29.37 received for order 123",
    "Your OTP is 123456",
    "ping",
  ])("ignores non-credits: %s", (text) => {
    expect(parsePaymentMessage(text).isCredit).toBe(false);
  });

  it.each([
    "Payment Received - ?29.69 received from Test Payer",
    "Payment Received - â‚¹29.69 received from Test Payer",
  ])("tolerates a mangled rupee symbol: %s", (text) => {
    expect(parsePaymentMessage(text)).toMatchObject({ isCredit: true, amountPaise: 2969 });
  });

  it("does not treat an order or reference number as an amount", () => {
    expect(parsePaymentMessage("Received payment for order #123456").isCredit).toBe(false);
  });

  it("does not treat an unlabelled 12-digit number as a UTR", () => {
    expect(parsePaymentMessage("Received ₹29.37 in a/c 123456789012").utr).toBeNull();
  });
});
