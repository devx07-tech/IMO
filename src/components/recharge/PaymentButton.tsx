import { Loader2, Lock } from "lucide-react";
import { PaymentFlowState } from "@/lib/types";

interface PaymentButtonProps {
  flowState: PaymentFlowState;
}

const BUSY_STATES: PaymentFlowState[] = [
  "creating_order",
  "awaiting_payment",
  "verifying",
];

export function PaymentButton({ flowState }: PaymentButtonProps) {
  const isBusy = BUSY_STATES.includes(flowState);

  return (
    <div>
      <button
        type="submit"
        disabled={isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-button bg-accent px-4 py-3.5 text-base font-semibold text-white transition-colors enabled:hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {isBusy ? (
          <>
            <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
            Processing...
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" aria-hidden="true" />
            Proceed to Pay
          </>
        )}
      </button>

      <p className="mt-2.5 text-center text-xs text-muted">
        Secure UPI payments · Google Pay, PhonePe, Paytm and more
      </p>
    </div>
  );
}
