const jpy = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
})

export function formatYen(value: number): string {
  if (!Number.isFinite(value)) return '¥0'
  return jpy.format(value)
}
