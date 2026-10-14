// Parses "payment received" texts forwarded by the payment bridge phone
// (Paytm for Business notifications or bank SMS). Pure so it can be unit tested.

export interface ParsedPaymentMessage {
  /** True only for incoming money; debits, refunds and OTPs are false. */
  isCredit: boolean;
  amountPaise: number | null;
  utr: string | null;
  payer: string | null;
}

const CREDIT_RE = /\b(received|credited|credit of|added to your|payment of .* successful)\b/i;
const NOT_CREDIT_RE = /\b(debited|sent to|paid to|refund|reversed|failed|declined|otp|requested|request from|collect)\b/i;
const AMOUNT_RE = /(?:₹|\brs\.?|\binr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
// Forwarder apps sometimes mangle "₹" into "?" or "â‚¹". Order amounts always
// carry paise, so a symbol followed by a two-decimal amount is accepted too.
const MANGLED_AMOUNT_RE = /[^\w\s.,:]{1,3}\s?([0-9][0-9,]*\.[0-9]{2})(?![0-9])/;
// Only a 12-digit number explicitly labelled as a reference counts as a UTR;
// bare 12-digit numbers in SMS are often account numbers.
// Bank SMS (e.g. ICICI) write it as "UPI:412345678901" or "Info UPI-412345678901".
const UTR_RE = /(?:\butr|upi\s*ref(?:erence)?|\bref(?:erence)?|\brrn|txn|transaction|\bupi)\s*(?:no\.?|number|id)?\s*[:.#-]?\s*(\d{12})\b/i;
const PAYER_RE = /\bfrom\s+([A-Za-z0-9][A-Za-z0-9 .@_-]{1,60}?)(?=\s*(?:[.,;]|\bon\b|\bvia\b|\bto\b|\bupi\b|\bref|\butr|$))/i;

export function parseAmountPaise(value: string): number | null {
  const [rupees, fraction = ""] = value.replace(/,/g, "").split(".");
  if (!/^\d{1,9}$/.test(rupees) || !/^\d{0,2}$/.test(fraction)) return null;
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return paise > 0 ? paise : null;
}

export function parsePaymentMessage(text: string): ParsedPaymentMessage {
  const normalized = text.replace(/\s+/g, " ").trim();
  const amountMatch = normalized.match(AMOUNT_RE) ?? normalized.match(MANGLED_AMOUNT_RE);
  const amountPaise = amountMatch ? parseAmountPaise(amountMatch[1]) : null;
  const isCredit = CREDIT_RE.test(normalized) && !NOT_CREDIT_RE.test(normalized) && amountPaise !== null;
  return {
    isCredit,
    amountPaise,
    utr: normalized.match(UTR_RE)?.[1] ?? null,
    payer: normalized.match(PAYER_RE)?.[1]?.trim() ?? null,
  };
}
