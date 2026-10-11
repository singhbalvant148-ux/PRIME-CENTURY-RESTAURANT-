import ExcelJS from 'exceljs';
import { Bill, DailySalesSummary, MonthlySalesSummary } from '../types/pos';
import { sanitizeSpreadsheetCell, toRupees, toPaise, formatRupees } from './currencyMath';

// Common styling constants for professional financial workbooks
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E293B' }, // Slate 800
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Segoe UI',
  size: 10,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};

const TITLE_FONT: Partial<ExcelJS.Font> = {
  name: 'Segoe UI',
  size: 14,
  bold: true,
  color: { argb: 'FF0F172A' },
};

const SUBTITLE_FONT: Partial<ExcelJS.Font> = {
  name: 'Segoe UI',
  size: 9,
  italic: true,
  color: { argb: 'FF64748B' },
};

const SUMMARY_HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' }, // Slate 100
};

const TOTAL_ROW_FONT: Partial<ExcelJS.Font> = {
  name: 'Segoe UI',
  size: 10,
  bold: true,
  color: { argb: 'FF0F172A' },
};

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
};

const BORDER_TOTAL: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF0F172A' } },
  bottom: { style: 'double', color: { argb: 'FF0F172A' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
};

const CURRENCY_FORMAT = '₹#,##0.00';

/**
 * Builds an ExcelJS Workbook object for Daily Sales
 */
export async function buildDailySalesWorkbook(
  dateStr: string,
  bills: Bill[],
  summary: DailySalesSummary,
  restaurantName: string = 'PRIME CENTURY CAFE & RESTAURANT',
  ownerName: string = 'Owner'
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = `${restaurantName} POS`;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Daily Sales Register', {
    views: [{ showGridLines: true }],
  });

  // Title Block
  sheet.addRow([restaurantName]);
  sheet.addRow(['DAILY SALES & FINANCIAL AUDIT REPORT']);
  sheet.addRow([
    `Report Date: ${dateStr}   |   Generated: ${new Date().toLocaleString('en-IN')}   |   Authorized By: ${ownerName}`,
  ]);
  sheet.addRow([]); // Blank spacer

  const titleRow = sheet.getRow(1);
  titleRow.font = TITLE_FONT;
  const subtitleRow = sheet.getRow(2);
  subtitleRow.font = { ...TITLE_FONT, size: 12, color: { argb: 'FF334155' } };
  const metaRow = sheet.getRow(3);
  metaRow.font = SUBTITLE_FONT;

  // Daily Summary KPI Block
  sheet.addRow(['DAILY FINANCIAL SUMMARY', '', '', '', 'PAYMENT RECONCILIATION', '']);
  const sumHeaderRow = sheet.getRow(5);
  sumHeaderRow.font = { bold: true, color: { argb: 'FF0F172A' } };
  sumHeaderRow.fill = SUMMARY_HEADER_FILL;

  sheet.addRow([
    'Gross Invoiced Sales:',
    summary.totalGrossSales,
    '',
    '',
    'Cash Register Collected:',
    summary.cashTotal,
  ]);
  sheet.addRow([
    'Voided / Cancelled Bills:',
    summary.totalVoidedSales,
    '',
    '',
    'Bank / UPI / Card Collected:',
    summary.bankTotal,
  ]);
  sheet.addRow([
    'Net Realized Revenue:',
    summary.totalNetSales,
    '',
    '',
    '  - UPI / QR Collections:',
    summary.upiTotal,
  ]);
  sheet.addRow([
    'Total GST Collected (CGST+SGST):',
    summary.totalTax,
    '',
    '',
    '  - Card Terminal Collections:',
    summary.cardTotal,
  ]);
  sheet.addRow([
    'Total Discounts Conceded:',
    summary.totalDiscount,
    '',
    '',
    'Total Paid Invoices Count:',
    summary.totalOrders,
  ]);
  sheet.addRow([
    'Average Order Value (AOV):',
    summary.avgOrderValue,
    '',
    '',
    'Voided Invoices Count:',
    summary.voidedOrdersCount,
  ]);

  // Format summary numbers
  for (let r = 6; r <= 11; r++) {
    const row = sheet.getRow(r);
    row.getCell(2).numFmt = CURRENCY_FORMAT;
    row.getCell(6).numFmt = r <= 9 ? CURRENCY_FORMAT : '#,##0';
    row.font = { name: 'Segoe UI', size: 9 };
    row.getCell(1).font = { bold: true, size: 9 };
    row.getCell(5).font = { bold: true, size: 9 };
  }

  sheet.addRow([]); // Blank spacer

  // Invoices Table Header
  const tableHeaderIndex = 13;
  const headers = [
    'Invoice No.',
    'Time Paid',
    'Table',
    'Cashier',
    'Ordered Items Details',
    'Subtotal (₹)',
    'Discount (₹)',
    'CGST (₹)',
    'SGST (₹)',
    'Total Tax (₹)',
    'Grand Total (₹)',
    'Payment Mode',
    'Cash (₹)',
    'Bank/Digital (₹)',
    'Status',
    'Void / Audit Remarks',
  ];

  sheet.addRow(headers);
  const tblHeaderRow = sheet.getRow(tableHeaderIndex);
  tblHeaderRow.font = HEADER_FONT;
  tblHeaderRow.fill = HEADER_FILL;
  tblHeaderRow.height = 24;

  let totalSubtotal = 0;
  let totalDiscount = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalTax = 0;
  let totalGrand = 0;
  let totalCash = 0;
  let totalBank = 0;

  bills.forEach((bill) => {
    const isVoid = Boolean(bill.isVoided || bill.paymentStatus === 'voided');
    const itemsDesc = (bill.items || []).map((it) => `${it.quantity}x ${it.name}`).join('; ');

    const sub = Number(bill.subtotal) || 0;
    const disc = Number(bill.discountAmount) || 0;
    const cgst = Number(bill.cgstAmount) || 0;
    const sgst = Number(bill.sgstAmount) || 0;
    const tax = cgst + sgst;
    const grand = Number(bill.grandTotal) || 0;

    let cashAmt = 0;
    let bankAmt = 0;

    if (!isVoid) {
      if (bill.paymentMethod === 'cash') {
        cashAmt = grand;
      } else if (bill.paymentMethod === 'upi' || bill.paymentMethod === 'card') {
        bankAmt = grand;
      } else if (bill.paymentMethod === 'split') {
        cashAmt = Number(bill.cashAmount) || 0;
        bankAmt = Number(bill.bankAmount) || 0;
      }

      totalSubtotal += sub;
      totalDiscount += disc;
      totalCGST += cgst;
      totalSGST += sgst;
      totalTax += tax;
      totalGrand += grand;
      totalCash += cashAmt;
      totalBank += bankAmt;
    }

    const rowValues = [
      sanitizeSpreadsheetCell(bill.billNumber),
      new Date(bill.paidAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      `Table ${bill.tableId}`,
      sanitizeSpreadsheetCell(bill.cashierName || 'Cashier'),
      sanitizeSpreadsheetCell(itemsDesc),
      sub,
      disc,
      cgst,
      sgst,
      tax,
      grand,
      (bill.paymentMethod || 'cash').toUpperCase(),
      cashAmt,
      bankAmt,
      isVoid ? 'VOIDED' : 'PAID',
      sanitizeSpreadsheetCell(bill.voidReason || (isVoid ? 'Voided by Owner' : 'Settled')),
    ];

    const addedRow = sheet.addRow(rowValues);
    addedRow.font = { name: 'Segoe UI', size: 9 };
    addedRow.border = BORDER_THIN;

    if (isVoid) {
      addedRow.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF991B1B' }, italic: true };
    }

    // Number formats for currency columns (cols 6 to 11, 13, 14)
    [6, 7, 8, 9, 10, 11, 13, 14].forEach((colIdx) => {
      addedRow.getCell(colIdx).numFmt = CURRENCY_FORMAT;
    });
  });

  // Total Summary Footer Row
  const totalRow = sheet.addRow([
    'TOTALS (NET ACTIVE)',
    '',
    '',
    '',
    `${bills.filter((b) => !b.isVoided).length} Invoices`,
    totalSubtotal,
    totalDiscount,
    totalCGST,
    totalSGST,
    totalTax,
    totalGrand,
    '',
    totalCash,
    totalBank,
    '',
    '',
  ]);

  totalRow.font = TOTAL_ROW_FONT;
  totalRow.border = BORDER_TOTAL;
  totalRow.height = 22;
  [6, 7, 8, 9, 10, 11, 13, 14].forEach((colIdx) => {
    totalRow.getCell(colIdx).numFmt = CURRENCY_FORMAT;
  });

  // Adjust column widths
  sheet.columns = [
    { width: 18 }, // Invoice No.
    { width: 12 }, // Time
    { width: 11 }, // Table
    { width: 16 }, // Cashier
    { width: 34 }, // Items
    { width: 14 }, // Subtotal
    { width: 13 }, // Discount
    { width: 12 }, // CGST
    { width: 12 }, // SGST
    { width: 13 }, // Total Tax
    { width: 15 }, // Grand Total
    { width: 14 }, // Mode
    { width: 14 }, // Cash
    { width: 15 }, // Bank/Digital
    { width: 12 }, // Status
    { width: 24 }, // Void Remarks
  ];

  return workbook;
}

/**
 * Generates an Excel (.xlsx) Blob for Daily Sales
 */
export async function generateDailySalesExcel(
  dateStr: string,
  bills: Bill[],
  summary: DailySalesSummary,
  restaurantName: string = 'PRIME CENTURY CAFE & RESTAURANT',
  ownerName: string = 'Owner'
): Promise<Blob> {
  const workbook = await buildDailySalesWorkbook(dateStr, bills, summary, restaurantName, ownerName);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Builds a Multi-Sheet ExcelJS Workbook object for Monthly Sales
 */
export async function buildMonthlySalesWorkbook(
  monthStr: string,
  monthlySummary: MonthlySalesSummary,
  bills: Bill[],
  restaurantName: string = 'PRIME CENTURY CAFE & RESTAURANT',
  ownerName: string = 'Owner'
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = `${restaurantName} POS`;
  workbook.created = new Date();

  // ==========================================
  // SHEET 1: Monthly Summary
  // ==========================================
  const summarySheet = workbook.addWorksheet('Monthly Summary', {
    views: [{ showGridLines: true }],
  });

  summarySheet.addRow([restaurantName]);
  summarySheet.addRow([`MONTHLY SALES & REVENUE REPORT - ${monthlySummary.monthName.toUpperCase()}`]);
  summarySheet.addRow([
    `Period: ${monthStr}   |   Generated: ${new Date().toLocaleString('en-IN')}   |   Authorized By: ${ownerName}`,
  ]);
  summarySheet.addRow([]);

  summarySheet.getRow(1).font = TITLE_FONT;
  summarySheet.getRow(2).font = { ...TITLE_FONT, size: 12, color: { argb: 'FF334155' } };
  summarySheet.getRow(3).font = SUBTITLE_FONT;

  // Key KPI Cards Table
  summarySheet.addRow(['EXECUTIVE FINANCIAL HIGHLIGHTS', 'AMOUNT (₹)', 'REMARKS / DETAILS']);
  const kpiHeader = summarySheet.getRow(5);
  kpiHeader.font = HEADER_FONT;
  kpiHeader.fill = HEADER_FILL;

  const kpis: [string, number, string][] = [
    ['Gross Invoiced Turnover', monthlySummary.totalGrossSales, 'Total value of all punch-in invoices generated'],
    ['Voided / Cancelled Invoices Amount', monthlySummary.totalVoidedSales, `${monthlySummary.voidedBillsCount} voided invoices`],
    ['Net Realized Sales (Revenue)', monthlySummary.totalNetSales, 'Actual business revenue collected'],
    ['Cash Register Collected', monthlySummary.cashTotal, 'Cash received in register'],
    ['Bank & Digital Collected (UPI + Card)', monthlySummary.bankTotal, 'Total electronic & bank receipts'],
    ['  - UPI / QR Payments', monthlySummary.upiTotal, 'Direct instant UPI transfers'],
    ['  - Card / Terminal Payments', monthlySummary.cardTotal, 'Debit & Credit card payments'],
    ['Total GST Withheld (CGST + SGST)', monthlySummary.totalTax, `CGST: ₹${monthlySummary.totalCGST.toFixed(2)} | SGST: ₹${monthlySummary.totalSGST.toFixed(2)}`],
    ['Total Discounts Conceded', monthlySummary.totalDiscount, 'Promotional & staff discounts allowed'],
    ['Daily Average Sales Turnover', monthlySummary.dailyAverage, 'Average revenue per calendar day'],
  ];

  kpis.forEach(([label, val, note]) => {
    const row = summarySheet.addRow([label, val, note]);
    row.font = { name: 'Segoe UI', size: 9 };
    row.getCell(1).font = { bold: true, size: 9 };
    row.getCell(2).numFmt = CURRENCY_FORMAT;
    row.border = BORDER_THIN;
  });

  summarySheet.addRow([]);
  summarySheet.addRow(['INVOICE VOLUME METRICS', 'COUNT', '']);
  const volHeader = summarySheet.getRow(17);
  volHeader.font = HEADER_FONT;
  volHeader.fill = SUMMARY_HEADER_FILL;

  const volumes: [string, number][] = [
    ['Total Settled Active Invoices', monthlySummary.activeBillsCount],
    ['Voided Invoices Count', monthlySummary.voidedBillsCount],
    ['Total Invoices Processed', monthlySummary.totalBillsCount],
  ];

  volumes.forEach(([label, val]) => {
    const row = summarySheet.addRow([label, val, '']);
    row.font = { name: 'Segoe UI', size: 9 };
    row.getCell(1).font = { bold: true, size: 9 };
    row.getCell(2).numFmt = '#,##0';
    row.border = BORDER_THIN;
  });

  summarySheet.columns = [{ width: 38 }, { width: 22 }, { width: 45 }];

  // ==========================================
  // SHEET 2: Daily Breakdown
  // ==========================================
  const dailySheet = workbook.addWorksheet('Daily Breakdown', {
    views: [{ showGridLines: true }],
  });

  dailySheet.addRow([restaurantName]);
  dailySheet.addRow([`DAY-BY-DAY REVENUE BREAKDOWN - ${monthlySummary.monthName}`]);
  dailySheet.addRow([]);

  dailySheet.getRow(1).font = TITLE_FONT;
  dailySheet.getRow(2).font = { ...TITLE_FONT, size: 11, color: { argb: 'FF334155' } };

  const dailyHeaders = [
    'Date (YYYY-MM-DD)',
    'Day of Week',
    'Bills Count',
    'Gross Sales (₹)',
    'Cash Collected (₹)',
    'Bank/Digital (₹)',
    'GST Tax (₹)',
    'Discount (₹)',
    'Voided Count',
    'Voided Amount (₹)',
    'Net Realized Revenue (₹)',
  ];

  dailySheet.addRow(dailyHeaders);
  const dailyHdrRow = dailySheet.getRow(4);
  dailyHdrRow.font = HEADER_FONT;
  dailyHdrRow.fill = HEADER_FILL;
  dailyHdrRow.height = 24;

  let sumGross = 0;
  let sumCash = 0;
  let sumBank = 0;
  let sumTax = 0;
  let sumDisc = 0;
  let sumVoidedCount = 0;
  let sumVoidedAmt = 0;
  let sumNet = 0;
  let sumBillsCount = 0;

  monthlySummary.dailyBreakdown.forEach((item) => {
    sumGross += item.grossSales;
    sumCash += item.cashCollected;
    sumBank += item.bankCollected;
    sumTax += item.taxCollected;
    sumDisc += item.discountGiven;
    sumVoidedCount += item.voidedCount;
    sumVoidedAmt += item.voidedAmount;
    sumNet += item.netRevenue;
    sumBillsCount += item.billsCount;

    const row = dailySheet.addRow([
      item.date,
      item.dayOfWeek,
      item.billsCount,
      item.grossSales,
      item.cashCollected,
      item.bankCollected,
      item.taxCollected,
      item.discountGiven,
      item.voidedCount,
      item.voidedAmount,
      item.netRevenue,
    ]);

    row.font = { name: 'Segoe UI', size: 9 };
    row.border = BORDER_THIN;
    row.getCell(3).numFmt = '#,##0';
    row.getCell(9).numFmt = '#,##0';
    [4, 5, 6, 7, 8, 10, 11].forEach((col) => {
      row.getCell(col).numFmt = CURRENCY_FORMAT;
    });
  });

  // Daily Totals Row
  const dailyTotalRow = dailySheet.addRow([
    'MONTH TOTAL',
    '',
    sumBillsCount,
    sumGross,
    sumCash,
    sumBank,
    sumTax,
    sumDisc,
    sumVoidedCount,
    sumVoidedAmt,
    sumNet,
  ]);
  dailyTotalRow.font = TOTAL_ROW_FONT;
  dailyTotalRow.border = BORDER_TOTAL;
  dailyTotalRow.height = 22;
  dailyTotalRow.getCell(3).numFmt = '#,##0';
  dailyTotalRow.getCell(9).numFmt = '#,##0';
  [4, 5, 6, 7, 8, 10, 11].forEach((col) => {
    dailyTotalRow.getCell(col).numFmt = CURRENCY_FORMAT;
  });

  dailySheet.columns = [
    { width: 18 }, // Date
    { width: 14 }, // Day
    { width: 13 }, // Bills Count
    { width: 16 }, // Gross
    { width: 16 }, // Cash
    { width: 16 }, // Bank
    { width: 14 }, // Tax
    { width: 14 }, // Discount
    { width: 13 }, // Voids Count
    { width: 16 }, // Voids Amt
    { width: 18 }, // Net
  ];

  // ==========================================
  // SHEET 3: Bill Details
  // ==========================================
  const billsSheet = workbook.addWorksheet('Bill Details', {
    views: [{ showGridLines: true }],
  });

  billsSheet.addRow([restaurantName]);
  billsSheet.addRow([`ITEMIZED INVOICES LEDGER - ${monthlySummary.monthName}`]);
  billsSheet.addRow([]);

  billsSheet.getRow(1).font = TITLE_FONT;
  billsSheet.getRow(2).font = { ...TITLE_FONT, size: 11, color: { argb: 'FF334155' } };

  const billHeaders = [
    'Invoice No.',
    'Date',
    'Time',
    'Table',
    'Cashier',
    'Items Summary',
    'Subtotal (₹)',
    'Discount (₹)',
    'CGST (₹)',
    'SGST (₹)',
    'Total Tax (₹)',
    'Grand Total (₹)',
    'Payment Mode',
    'Cash (₹)',
    'Bank/Digital (₹)',
    'Status',
    'Audit Remarks',
  ];

  billsSheet.addRow(billHeaders);
  const bHdrRow = billsSheet.getRow(4);
  bHdrRow.font = HEADER_FONT;
  bHdrRow.fill = HEADER_FILL;
  bHdrRow.height = 24;

  bills.forEach((bill) => {
    const isVoid = Boolean(bill.isVoided || bill.paymentStatus === 'voided');
    const itemsDesc = (bill.items || []).map((it) => `${it.quantity}x ${it.name}`).join('; ');
    const paidDate = new Date(bill.paidAt);

    const sub = Number(bill.subtotal) || 0;
    const disc = Number(bill.discountAmount) || 0;
    const cgst = Number(bill.cgstAmount) || 0;
    const sgst = Number(bill.sgstAmount) || 0;
    const tax = cgst + sgst;
    const grand = Number(bill.grandTotal) || 0;

    let cashAmt = 0;
    let bankAmt = 0;

    if (!isVoid) {
      if (bill.paymentMethod === 'cash') cashAmt = grand;
      else if (bill.paymentMethod === 'upi' || bill.paymentMethod === 'card') bankAmt = grand;
      else if (bill.paymentMethod === 'split') {
        cashAmt = Number(bill.cashAmount) || 0;
        bankAmt = Number(bill.bankAmount) || 0;
      }
    }

    const row = billsSheet.addRow([
      sanitizeSpreadsheetCell(bill.billNumber),
      paidDate.toISOString().split('T')[0],
      paidDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      `Table ${bill.tableId}`,
      sanitizeSpreadsheetCell(bill.cashierName || 'Cashier'),
      sanitizeSpreadsheetCell(itemsDesc),
      sub,
      disc,
      cgst,
      sgst,
      tax,
      grand,
      (bill.paymentMethod || 'cash').toUpperCase(),
      cashAmt,
      bankAmt,
      isVoid ? 'VOIDED' : 'PAID',
      sanitizeSpreadsheetCell(bill.voidReason || (isVoid ? 'Voided' : 'Settled')),
    ]);

    row.font = { name: 'Segoe UI', size: 9 };
    row.border = BORDER_THIN;
    if (isVoid) {
      row.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF991B1B' }, italic: true };
    }
    [7, 8, 9, 10, 11, 12, 14, 15].forEach((c) => {
      row.getCell(c).numFmt = CURRENCY_FORMAT;
    });
  });

  billsSheet.columns = [
    { width: 18 },
    { width: 13 },
    { width: 11 },
    { width: 11 },
    { width: 16 },
    { width: 34 },
    { width: 14 },
    { width: 13 },
    { width: 12 },
    { width: 12 },
    { width: 13 },
    { width: 15 },
    { width: 14 },
    { width: 14 },
    { width: 15 },
    { width: 12 },
    { width: 22 },
  ];

  return workbook;
}

/**
 * Generates an Excel (.xlsx) Blob for Monthly Sales
 */
export async function generateMonthlySalesExcel(
  monthStr: string,
  monthlySummary: MonthlySalesSummary,
  bills: Bill[],
  restaurantName: string = 'PRIME CENTURY CAFE & RESTAURANT',
  ownerName: string = 'Owner'
): Promise<Blob> {
  const workbook = await buildMonthlySalesWorkbook(monthStr, monthlySummary, bills, restaurantName, ownerName);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Generates an RFC-4180 compliant CSV export for Daily Sales
 * Escapes cells against CSV formula injection.
 */
export function generateDailySalesCSV(
  dateStr: string,
  bills: Bill[],
  summary: DailySalesSummary,
  restaurantName: string = 'PRIME CENTURY CAFE & RESTAURANT'
): string {
  const rows: string[][] = [
    [restaurantName],
    [`DAILY SALES & AUDIT REPORT - ${dateStr}`],
    [`Generated: ${new Date().toISOString()}`],
    [],
    ['SUMMARY KEY METRICS', ''],
    ['Gross Invoiced Sales', String(summary.totalGrossSales)],
    ['Voided Invoices Sales', String(summary.totalVoidedSales)],
    ['Net Realized Revenue', String(summary.totalNetSales)],
    ['Cash Register Collected', String(summary.cashTotal)],
    ['Bank & Digital Collected', String(summary.bankTotal)],
    ['GST Tax Collected', String(summary.totalTax)],
    ['Total Invoices Count', String(summary.totalOrders)],
    ['Voided Invoices Count', String(summary.voidedOrdersCount)],
    [],
    [
      'Invoice No',
      'Date Time',
      'Table',
      'Cashier',
      'Items Ordered',
      'Subtotal',
      'Discount',
      'CGST',
      'SGST',
      'Total Tax',
      'Grand Total',
      'Payment Method',
      'Cash Paid',
      'Bank Paid',
      'Status',
      'Void Remarks',
    ],
  ];

  bills.forEach((b) => {
    const isVoid = Boolean(b.isVoided || b.paymentStatus === 'voided');
    const items = (b.items || []).map((it) => `${it.quantity}x ${it.name}`).join('; ');
    const grand = Number(b.grandTotal) || 0;
    let cash = 0;
    let bank = 0;
    if (!isVoid) {
      if (b.paymentMethod === 'cash') cash = grand;
      else if (b.paymentMethod === 'upi' || b.paymentMethod === 'card') bank = grand;
      else if (b.paymentMethod === 'split') {
        cash = Number(b.cashAmount) || 0;
        bank = Number(b.bankAmount) || 0;
      }
    }

    rows.push([
      String(sanitizeSpreadsheetCell(b.billNumber)),
      b.paidAt,
      `Table ${b.tableId}`,
      String(sanitizeSpreadsheetCell(b.cashierName || 'Cashier')),
      String(sanitizeSpreadsheetCell(items)),
      String(b.subtotal || 0),
      String(b.discountAmount || 0),
      String(b.cgstAmount || 0),
      String(b.sgstAmount || 0),
      String((b.cgstAmount || 0) + (b.sgstAmount || 0)),
      String(grand),
      (b.paymentMethod || 'cash').toUpperCase(),
      String(cash),
      String(bank),
      isVoid ? 'VOIDED' : 'PAID',
      String(sanitizeSpreadsheetCell(b.voidReason || '')),
    ]);
  });

  return rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          // Quote cell if it contains comma, quote, or newline
          if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\r\n');
}

/**
 * Generates an RFC-4180 compliant CSV export for Monthly Sales
 */
export function generateMonthlySalesCSV(
  monthStr: string,
  monthlySummary: MonthlySalesSummary,
  bills: Bill[],
  restaurantName: string = 'PRIME CENTURY CAFE & RESTAURANT'
): string {
  const rows: string[][] = [
    [restaurantName],
    [`MONTHLY SALES REPORT - ${monthlySummary.monthName} (${monthStr})`],
    [`Generated: ${new Date().toISOString()}`],
    [],
    ['EXECUTIVE SUMMARY', ''],
    ['Gross Turnover', String(monthlySummary.totalGrossSales)],
    ['Net Revenue', String(monthlySummary.totalNetSales)],
    ['Voided Turnover', String(monthlySummary.totalVoidedSales)],
    ['Cash Collected', String(monthlySummary.cashTotal)],
    ['Bank/Digital Collected', String(monthlySummary.bankTotal)],
    ['GST Tax Withheld', String(monthlySummary.totalTax)],
    ['Total Invoices Count', String(monthlySummary.totalBillsCount)],
    ['Voided Invoices Count', String(monthlySummary.voidedBillsCount)],
    ['Daily Average Sales', String(monthlySummary.dailyAverage)],
    [],
    ['DAILY BREAKDOWN', '', '', '', '', '', '', '', ''],
    ['Date', 'Day', 'Invoices', 'Gross Sales', 'Cash', 'Bank', 'Tax', 'Discount', 'Net Revenue'],
  ];

  monthlySummary.dailyBreakdown.forEach((d) => {
    rows.push([
      d.date,
      d.dayOfWeek,
      String(d.billsCount),
      String(d.grossSales),
      String(d.cashCollected),
      String(d.bankCollected),
      String(d.taxCollected),
      String(d.discountGiven),
      String(d.netRevenue),
    ]);
  });

  rows.push([]);
  rows.push([
    'ITEMIZED INVOICES',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  rows.push([
    'Invoice No',
    'Date',
    'Table',
    'Cashier',
    'Items',
    'Subtotal',
    'Discount',
    'CGST',
    'SGST',
    'Grand Total',
    'Mode',
    'Cash',
    'Bank',
    'Status',
  ]);

  bills.forEach((b) => {
    const isVoid = Boolean(b.isVoided || b.paymentStatus === 'voided');
    const items = (b.items || []).map((it) => `${it.quantity}x ${it.name}`).join('; ');
    const grand = Number(b.grandTotal) || 0;
    let cash = 0;
    let bank = 0;
    if (!isVoid) {
      if (b.paymentMethod === 'cash') cash = grand;
      else if (b.paymentMethod === 'upi' || b.paymentMethod === 'card') bank = grand;
      else if (b.paymentMethod === 'split') {
        cash = Number(b.cashAmount) || 0;
        bank = Number(b.bankAmount) || 0;
      }
    }

    rows.push([
      String(sanitizeSpreadsheetCell(b.billNumber)),
      b.paidAt ? b.paidAt.split('T')[0] : '',
      `Table ${b.tableId}`,
      String(sanitizeSpreadsheetCell(b.cashierName || 'Cashier')),
      String(sanitizeSpreadsheetCell(items)),
      String(b.subtotal || 0),
      String(b.discountAmount || 0),
      String(b.cgstAmount || 0),
      String(b.sgstAmount || 0),
      String(grand),
      (b.paymentMethod || 'cash').toUpperCase(),
      String(cash),
      String(bank),
      isVoid ? 'VOIDED' : 'PAID',
    ]);
  });

  return rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\r\n');
}

/**
 * Downloads a Blob or text content directly in browser
 */
export function triggerFileDownload(content: Blob | string, filename: string): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: 'text/csv;charset=utf-8;' }) : content;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
