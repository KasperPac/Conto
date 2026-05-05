declare const __brand: unique symbol;
export type Cents = bigint & { readonly [__brand]: 'Cents' };
export const toCents = (n: bigint): Cents => n as Cents;
