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
