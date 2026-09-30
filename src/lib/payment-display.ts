// Preserve all meaningful USDC precision, with at least two decimals. No float conversion.
export function displayUsdc(value: string) {
  return value.replace(/(\.\d{2,}?)0+$/, '$1');
}
export function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}
