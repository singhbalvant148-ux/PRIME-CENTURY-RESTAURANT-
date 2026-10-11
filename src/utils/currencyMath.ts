/**
 * Exact Financial Precision Math Engine (Indian Rupees & Integer Paise)
 *
 * Prevents IEEE-754 floating-point drift over high transaction volumes
 * and cumulative sales exceeding ₹10 Crore (100,000,000 INR = 10,000,000,000 Paise).
 * All ledger balances, subtotals, tax withholdings, and collections are computed in integer paise.
 */

/**
 * Converts Indian Rupees to exact integer minor units (Paise).
 * e.g. 260.50 -> 26050
 */
export function toPaise(rupees: number | string | null | undefined): number {
  if (rupees === null || rupees === undefined || rupees === '') return 0;
  const num = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(num)) return 0;
  // Round to nearest integer to eliminate floating point binary representation artifacts
  return Math.round(num * 100);
}

/**
 * Converts integer minor units (Paise) to standard Indian Rupees (float with 2 decimal places).
 * e.g. 26050 -> 260.5
 */
export function toRupees(paise: number | null | undefined): number {
  if (!paise || isNaN(paise)) return 0;
  return Math.round(paise) / 100;
}

/**
 * Formats a Rupee amount into standard Indian Rupee notation (e.g. ₹10,00,000.00).
 */
export function formatRupees(amountInRupees: number, showDecimals: boolean = true): string {
  if (isNaN(amountInRupees)) return '₹0.00';
  const fixed = amountInRupees.toFixed(showDecimals ? 2 : 0);
  const [integerPart, decimalPart] = fixed.split('.');
  
  // Format integer with Indian numbering system (3 digits, then groups of 2 digits)
  const isNegative = integerPart.startsWith('-');
  const absInteger = isNegative ? integerPart.slice(1) : integerPart;
  
  let lastThree = absInteger.slice(-3);
  const otherNumbers = absInteger.slice(0, -3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  const result = (isNegative ? '-' : '') + formattedInteger;

  return showDecimals && decimalPart ? `₹${result}.${decimalPart}` : `₹${result}`;
}

/**
 * Sums an arbitrary array of paise integers safely.
 */
export function sumPaise(paiseList: (number | null | undefined)[]): number {
  return paiseList.reduce((acc: number, curr) => (acc || 0) + (Math.round(curr || 0)), 0) || 0;
}

export interface CalculatedBillTotals {
  subtotalPaise: number;
  discountAmountPaise: number;
  taxableAmountPaise: number;
  cgstAmountPaise: number;
  sgstAmountPaise: number;
  totalTaxPaise: number;
  grandTotalPaise: number;
  // Rupee conversions for presentation
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  totalTax: number;
  grandTotal: number;
}

/**
 * Deterministically calculates all bill totals using integer paise arithmetic.
 */
export function calculateBillTotals(
  items: { price: number; quantity: number }[],
  discountType: 'percentage' | 'flat',
  discountValue: number,
  cgstRate: number,
  sgstRate: number
): CalculatedBillTotals {
  // 1. Subtotal in paise
  const subtotalPaise = items.reduce((sum, it) => {
    const itemPricePaise = toPaise(it.price);
    const qty = Math.max(0, it.quantity || 1);
    return sum + itemPricePaise * qty;
  }, 0);

  // 2. Discount in paise
  let discountAmountPaise = 0;
  if (discountType === 'percentage') {
    const cleanRate = Math.max(0, Math.min(100, Number(discountValue) || 0));
    discountAmountPaise = Math.round((subtotalPaise * cleanRate) / 100);
  } else {
    discountAmountPaise = Math.min(toPaise(discountValue), subtotalPaise);
  }

  // 3. Taxable amount in paise
  const taxableAmountPaise = Math.max(0, subtotalPaise - discountAmountPaise);

  // 4. CGST & SGST in paise (e.g. 2.5%)
  const cleanCgstRate = Math.max(0, Number(cgstRate) || 0);
  const cleanSgstRate = Math.max(0, Number(sgstRate) || 0);
  const cgstAmountPaise = Math.round((taxableAmountPaise * cleanCgstRate) / 100);
  const sgstAmountPaise = Math.round((taxableAmountPaise * cleanSgstRate) / 100);
  const totalTaxPaise = cgstAmountPaise + sgstAmountPaise;

  // 5. Grand total in paise
  const grandTotalPaise = taxableAmountPaise + cgstAmountPaise + sgstAmountPaise;

  return {
    subtotalPaise,
    discountAmountPaise,
    taxableAmountPaise,
    cgstAmountPaise,
    sgstAmountPaise,
    totalTaxPaise,
    grandTotalPaise,
    subtotal: toRupees(subtotalPaise),
    discountAmount: toRupees(discountAmountPaise),
    taxableAmount: toRupees(taxableAmountPaise),
    cgstAmount: toRupees(cgstAmountPaise),
    sgstAmount: toRupees(sgstAmountPaise),
    totalTax: toRupees(totalTaxPaise),
    grandTotal: toRupees(grandTotalPaise),
  };
}

/**
 * Sanitizes spreadsheet cells against Formula Injection (CSV/Excel DDE attacks).
 * Any text starting with =, +, -, @, tab, or carriage return is prefixed with an apostrophe (').
 */
export function sanitizeSpreadsheetCell(value: any): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  
  const str = String(value).trim();
  if (str.length === 0) return '';

  const firstChar = str.charAt(0);
  if (['=', '+', '-', '@', '\t', '\r'].includes(firstChar)) {
    // Prepend single quote to neutralize formula evaluation in Excel/LibreOffice
    return `'${str}`;
  }
  return str;
}
