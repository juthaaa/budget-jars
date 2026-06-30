import type { Jar } from "@prisma/client";

export function calculateJarAllocations(
  netIncome: number,
  necAmount: number,
  jars: Jar[],
  pctOverrides: Record<number, number> = {} // jarId -> % override
): { jarId: number; code: string; amount: number; percentage: number | null }[] {
  const remaining = netIncome - necAmount;
  return jars.map((jar) => {
    if (jar.isNec) {
      return {
        jarId: jar.id,
        code: jar.code,
        amount: necAmount,
        percentage: netIncome > 0 ? (necAmount / netIncome) * 100 : null,
      };
    }
    const pct = pctOverrides[jar.id] ?? jar.percentage;
    return {
      jarId: jar.id,
      code: jar.code,
      amount: remaining * (pct / 100),
      percentage: pct,
    };
  });
}

export function getDefaultNecAmount(netIncome: number, necJar: Jar): number {
  if (necJar.percentage > 0) {
    return netIncome * (necJar.percentage / 100);
  }
  return 0;
}

export function formatTHB(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
