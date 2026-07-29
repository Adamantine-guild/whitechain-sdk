export type BigIntToString<T> = T extends bigint
  ? string
  : T extends readonly unknown[]
    ? { [Key in keyof T]: BigIntToString<T[Key]> }
    : T extends object
      ? { [Key in keyof T]: BigIntToString<T[Key]> }
      : T

export function formatBigIntToString<T>(value: T): BigIntToString<T> {
  if (typeof value === 'bigint') {
    return value.toString() as BigIntToString<T>
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatBigIntToString(item)) as BigIntToString<T>
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, formatBigIntToString(item)])
    ) as BigIntToString<T>
  }

  return value as BigIntToString<T>
}
