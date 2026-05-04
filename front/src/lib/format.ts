export const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

export const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);

export const formatHf = (value: number | null) => {
  if (value === null) return "INF";
  return value.toFixed(4);
};

export const formatDecimalText = (value: string | number | null | undefined, maxFractionDigits = 6) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxFractionDigits,
  }).format(numeric);
};
