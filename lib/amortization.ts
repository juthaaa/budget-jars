// Shared amortization math for the single-rate InstallmentPlan feature.
//
// This used to be duplicated verbatim in app/api/installment-plans/route.ts and
// app/api/installment-plans/[id]/route.ts under the mistaken belief that Next.js
// route files "cannot cross-import" — they can't import each other, but they
// import from lib/ freely, same as every other route in this codebase.
//
// Moved here byte-for-byte, including every Math.round(x * 100) / 100 step.
// Do NOT "clean up" the rounding: existing InstallmentPlan rows were generated
// with this exact per-step rounding baked in, and changing it would silently
// change stored amounts for plans created before this refactor.
//
// This is deliberately unrelated to lib/loan-schedule.ts (the multi-band loan
// engine) — different algorithm (single-rate closed-form vs. banded
// simulation) with intentionally different rounding rules (per-step here,
// never-inside-the-loop there). Do not merge them.
export function calcInstallmentAmounts(
  principal: number,
  n: number,
  rate: number,
  rateUnit: "month" | "year"
): number[] {
  const monthlyRate = rateUnit === "year" ? rate / 12 / 100 : rate / 100;

  if (monthlyRate <= 0) {
    const base = Math.round((principal / n) * 100) / 100;
    return Array.from({ length: n }, (_, i) =>
      i === n - 1
        ? Math.round((principal - base * i) * 100) / 100
        : base
    );
  }

  const fixedPayment = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
  const amounts: number[] = [];
  let balance = principal;

  for (let i = 0; i < n; i++) {
    const interest = Math.round(balance * monthlyRate * 100) / 100;
    if (i === n - 1) {
      amounts.push(Math.round((balance + interest) * 100) / 100);
      break;
    }
    const principalPaid = Math.round((fixedPayment - interest) * 100) / 100;
    amounts.push(Math.round((principalPaid + interest) * 100) / 100);
    balance = Math.round((balance - principalPaid) * 100) / 100;
  }

  return amounts;
}
