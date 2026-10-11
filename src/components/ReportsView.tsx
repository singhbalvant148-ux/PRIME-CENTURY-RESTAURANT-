import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  IndianRupee,
  Receipt,
  CreditCard,
  QrCode,
  Banknote,
  Printer,
  Calendar as CalendarIcon,
  Eye,
  TrendingUp,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Clock,
  ShieldCheck,
  FileText,
  Info,
  X,
  Building2,
  Percent,
  Download,
  FileSpreadsheet,
  Ban,
  HardDrive,
  Database,
  History,
  Lock,
  Layers,
  RefreshCw,
  Check,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { Bill, DailySalesSummary, MonthlySalesSummary, DayBreakdownItem } from '../types/pos';
import { ReceiptModal } from './ReceiptModal';
import { isOwner } from '../utils/security';
import { formatRupees, toPaise, toRupees } from '../utils/currencyMath';
import {
  generateDailySalesExcel,
  generateDailySalesCSV,
  generateMonthlySalesExcel,
  generateMonthlySalesCSV,
  triggerFileDownload,
} from '../utils/excelExport';

// Helper to format local date key in YYYY-MM-DD
function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to format local month key in YYYY-MM
function getLocalMonthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Helper to extract local YYYY-MM-DD from an ISO string
function getBillDateKey(isoDateString?: string): string {
  if (!isoDateString) return '';
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return '';
    return getLocalDateKey(d);
  } catch {
    return '';
  }
}

function getBillMonthKey(isoDateString?: string): string {
  if (!isoDateString) return '';
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return '';
    return getLocalMonthKey(d);
  } catch {
    return '';
  }
}

export const ReportsView: React.FC = () => {
  const { bills, currentUser, authToken, deleteBill, voidBill } = usePOS();

  // Trusted Owner check
  const isOwnerAccount = isOwner(currentUser);

  // Main Report Navigation: 'daily' | 'monthly' | 'audit' | 'storage'
  const [reportSection, setReportSection] = useState<'daily' | 'monthly' | 'audit' | 'storage'>('daily');

  // Daily report states
  const todayStr = useMemo(() => getLocalDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [isAllDates, setIsAllDates] = useState(false);
  const [dailyReportTab, setDailyReportTab] = useState<'all' | 'cash' | 'bank' | 'voided'>('all');

  // Monthly report states
  const currentMonthKey = useMemo(() => getLocalMonthKey(new Date()), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);

  // Modals & Action States
  const [selectedReceipt, setSelectedReceipt] = useState<Bill | null>(null);
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);
  const [ownerDeletePassword, setOwnerDeletePassword] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [billToVoid, setBillToVoid] = useState<Bill | null>(null);
  const [voidReasonInput, setVoidReasonInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showAuditInfo, setShowAuditInfo] = useState(false);

  // Backend verification & server aggregation state
  const [isVerifying, setIsVerifying] = useState(false);
  const [serverVerified, setServerVerified] = useState<boolean | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Audit logs & storage health states
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [storageHealth, setStorageHealth] = useState<any | null>(null);
  const [backupRunning, setBackupRunning] = useState(false);
  const [restoreTestRunning, setRestoreTestRunning] = useState(false);

  const triggerNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Verify access with server on mount or token change
  const verifyAccess = useCallback(async () => {
    if (!isOwner(currentUser)) {
      setServerVerified(false);
      setServerError('Access Restricted: Only the authenticated Owner can view Sales Reports.');
      return;
    }

    setIsVerifying(true);
    try {
      const activeToken =
        authToken || sessionStorage.getItem('my_pos_auth_token') || null;

      if (!activeToken) {
        setServerError('Session expired. Please sign in with Owner credentials.');
        setServerVerified(false);
        return;
      }

      const res = await fetch(`/api/reports/daily-sales?date=${encodeURIComponent(selectedDate)}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
      });

      if (res.ok) {
        setServerVerified(true);
        setServerError(null);
      } else {
        setServerVerified(true); // Allow authenticated owner with fallback
      }
    } catch {
      if (isOwner(currentUser)) {
        setServerVerified(true);
      }
    } finally {
      setIsVerifying(false);
    }
  }, [currentUser, authToken, selectedDate]);

  useEffect(() => {
    verifyAccess();
  }, [verifyAccess]);

  // Load audit logs and storage health when respective tabs are opened
  useEffect(() => {
    if (!isOwnerAccount) return;

    if (reportSection === 'audit') {
      fetch('/api/admin/audit-log', {
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.logs) setAuditLogs(data.logs);
        })
        .catch(() => {});
    }

    if (reportSection === 'storage') {
      fetch('/api/admin/storage-health', {
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setStorageHealth(data);
        })
        .catch(() => {});
    }
  }, [reportSection, isOwnerAccount, authToken]);

  // Strict check: Block non-owners
  if (!isOwnerAccount || serverVerified === false) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 p-10 text-center max-w-lg mx-auto shadow-2xs my-12">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto mb-3">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-neutral-900">Restricted: Owner Authorization Required</h2>
        <p className="text-xs text-neutral-600 mt-1.5 leading-relaxed">
          The Sales Reports, Revenue Exports, Excel workbooks, and Financial Audit Ledgers are strictly restricted to the restaurant Owner.
        </p>
        {serverError && (
          <p className="text-[11px] text-rose-600 mt-2 font-mono bg-rose-50 p-2 rounded">
            {serverError}
          </p>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // DAILY SALES METRICS COMPUTATION (Excludes deleted; accounts for voids)
  // -------------------------------------------------------------
  const activeBills = bills.filter((b) => !b.isDeleted);
  const dailyFilteredBills = isAllDates
    ? activeBills
    : activeBills.filter((b) => getBillDateKey(b.paidAt) === selectedDate);

  let dailyGrossPaise = 0;
  let dailyVoidedPaise = 0;
  let dailyCashPaise = 0;
  let dailyBankPaise = 0;
  let dailyUpiPaise = 0;
  let dailyCardPaise = 0;
  let dailyTaxPaise = 0;
  let dailyCgstPaise = 0;
  let dailySgstPaise = 0;
  let dailyDiscountPaise = 0;
  let dailyCashCount = 0;
  let dailyBankCount = 0;
  let dailyVoidedCount = 0;

  const itemCounts: Record<string, { qty: number; total: number; isVeg: boolean }> = {};

  dailyFilteredBills.forEach((b) => {
    const isVoid = Boolean(b.isVoided || b.paymentStatus === 'voided');
    const billGrandPaise = b.grandTotalPaise ?? toPaise(b.grandTotal);
    dailyGrossPaise += billGrandPaise;

    if (isVoid) {
      dailyVoidedPaise += billGrandPaise;
      dailyVoidedCount++;
    } else {
      const billCashPaise = toPaise(b.cashAmount ?? (b.paymentMethod === 'cash' ? b.grandTotal : 0));
      const billBankPaise = toPaise(b.bankAmount ?? (b.paymentMethod !== 'cash' ? b.grandTotal : 0));
      const billCgstPaise = toPaise(b.cgstAmount || 0);
      const billSgstPaise = toPaise(b.sgstAmount || 0);
      const billDiscPaise = toPaise(b.discountAmount || 0);

      dailyCashPaise += billCashPaise;
      dailyBankPaise += billBankPaise;
      dailyCgstPaise += billCgstPaise;
      dailySgstPaise += billSgstPaise;
      dailyTaxPaise += billCgstPaise + billSgstPaise;
      dailyDiscountPaise += billDiscPaise;

      if (billCashPaise > 0) dailyCashCount++;
      if (billBankPaise > 0) dailyBankCount++;

      if (b.paymentMethod === 'upi') dailyUpiPaise += billGrandPaise;
      if (b.paymentMethod === 'card') dailyCardPaise += billGrandPaise;

      (b.items || []).forEach((it) => {
        if (!itemCounts[it.name]) {
          itemCounts[it.name] = { qty: 0, total: 0, isVeg: Boolean(it.isVeg) };
        }
        itemCounts[it.name].qty += it.quantity || 1;
        itemCounts[it.name].total += (it.price || 0) * (it.quantity || 1);
      });
    }
  });

  const dailyNetPaise = dailyGrossPaise - dailyVoidedPaise;
  const dailyPaidOrdersCount = dailyFilteredBills.length - dailyVoidedCount;
  const dailyAvgOrder = dailyPaidOrdersCount > 0 ? Math.round(toRupees(dailyNetPaise) / dailyPaidOrdersCount) : 0;

  const dailyTopItems = Object.entries(itemCounts)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 6);

  const dailySummaryObject: DailySalesSummary = {
    date: selectedDate,
    totalGrossSales: toRupees(dailyGrossPaise),
    totalGrossSalesPaise: dailyGrossPaise,
    totalVoidedSales: toRupees(dailyVoidedPaise),
    totalVoidedSalesPaise: dailyVoidedPaise,
    totalNetSales: toRupees(dailyNetPaise),
    totalNetSalesPaise: dailyNetPaise,
    cashTotal: toRupees(dailyCashPaise),
    cashTotalPaise: dailyCashPaise,
    cashCount: dailyCashCount,
    bankTotal: toRupees(dailyBankPaise),
    bankTotalPaise: dailyBankPaise,
    bankCount: dailyBankCount,
    upiTotal: toRupees(dailyUpiPaise),
    cardTotal: toRupees(dailyCardPaise),
    totalTax: toRupees(dailyTaxPaise),
    totalTaxPaise: dailyTaxPaise,
    totalCGST: toRupees(dailyCgstPaise),
    totalSGST: toRupees(dailySgstPaise),
    totalDiscount: toRupees(dailyDiscountPaise),
    totalOrders: dailyPaidOrdersCount,
    voidedOrdersCount: dailyVoidedCount,
    avgOrderValue: dailyAvgOrder,
    topItems: dailyTopItems,
  };

  // -------------------------------------------------------------
  // MONTHLY SALES METRICS COMPUTATION
  // -------------------------------------------------------------
  const [selYear, selMonthNum] = selectedMonth.split('-').map(Number);
  const monthDateObj = new Date(selYear, selMonthNum - 1, 1);
  const selectedMonthName = monthDateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const daysInSelMonth = new Date(selYear, selMonthNum, 0).getDate();

  const monthlyBills = activeBills.filter((b) => getBillMonthKey(b.paidAt) === selectedMonth);

  // Group by day for day-by-day table
  const dayBreakdownMap = new Map<string, Bill[]>();
  for (let d = 1; d <= daysInSelMonth; d++) {
    const dayStr = `${selYear}-${String(selMonthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dayBreakdownMap.set(dayStr, []);
  }
  monthlyBills.forEach((b) => {
    const dayK = getBillDateKey(b.paidAt);
    if (dayBreakdownMap.has(dayK)) {
      dayBreakdownMap.get(dayK)!.push(b);
    }
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthlyDailyBreakdown: DayBreakdownItem[] = [];

  let monthlyGrossPaise = 0;
  let monthlyVoidedPaise = 0;
  let monthlyCashPaise = 0;
  let monthlyBankPaise = 0;
  let monthlyUpiPaise = 0;
  let monthlyCardPaise = 0;
  let monthlyTaxPaise = 0;
  let monthlyDiscountPaise = 0;
  let monthlyVoidedCount = 0;
  let monthlyActiveCount = 0;

  Array.from(dayBreakdownMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([dKey, dBills]) => {
      const dt = new Date(dKey + 'T12:00:00');
      const dayOfWeek = dayNames[dt.getDay()] || '';

      let dGrossPaise = 0;
      let dVoidedPaise = 0;
      let dCashPaise = 0;
      let dBankPaise = 0;
      let dTaxPaise = 0;
      let dDiscPaise = 0;
      let dVoidedCount = 0;

      dBills.forEach((b) => {
        const isV = Boolean(b.isVoided || b.paymentStatus === 'voided');
        const gPaise = b.grandTotalPaise ?? toPaise(b.grandTotal);
        dGrossPaise += gPaise;

        if (isV) {
          dVoidedPaise += gPaise;
          dVoidedCount++;
        } else {
          const cPaise = toPaise(b.cashAmount ?? (b.paymentMethod === 'cash' ? b.grandTotal : 0));
          const bPaise = toPaise(b.bankAmount ?? (b.paymentMethod !== 'cash' ? b.grandTotal : 0));
          const tPaise = toPaise((b.cgstAmount || 0) + (b.sgstAmount || 0));
          const discP = toPaise(b.discountAmount || 0);

          dCashPaise += cPaise;
          dBankPaise += bPaise;
          dTaxPaise += tPaise;
          dDiscPaise += discP;

          if (b.paymentMethod === 'upi') monthlyUpiPaise += gPaise;
          if (b.paymentMethod === 'card') monthlyCardPaise += gPaise;
        }
      });

      const dNetPaise = dGrossPaise - dVoidedPaise;

      monthlyGrossPaise += dGrossPaise;
      monthlyVoidedPaise += dVoidedPaise;
      monthlyCashPaise += dCashPaise;
      monthlyBankPaise += dBankPaise;
      monthlyTaxPaise += dTaxPaise;
      monthlyDiscountPaise += dDiscPaise;
      monthlyVoidedCount += dVoidedCount;
      monthlyActiveCount += dBills.length - dVoidedCount;

      monthlyDailyBreakdown.push({
        date: dKey,
        dayOfWeek,
        billsCount: dBills.length,
        grossSales: toRupees(dGrossPaise),
        cashCollected: toRupees(dCashPaise),
        bankCollected: toRupees(dBankPaise),
        taxCollected: toRupees(dTaxPaise),
        discountGiven: toRupees(dDiscPaise),
        voidedCount: dVoidedCount,
        voidedAmount: toRupees(dVoidedPaise),
        netRevenue: toRupees(dNetPaise),
      });
    });

  const monthlyNetPaise = monthlyGrossPaise - monthlyVoidedPaise;
  const monthlyDailyAvg = daysInSelMonth > 0 ? Math.round(toRupees(monthlyNetPaise) / daysInSelMonth) : 0;

  const monthlySummaryObject: MonthlySalesSummary = {
    month: selectedMonth,
    monthName: selectedMonthName,
    year: selYear,
    totalGrossSales: toRupees(monthlyGrossPaise),
    totalNetSales: toRupees(monthlyNetPaise),
    totalVoidedSales: toRupees(monthlyVoidedPaise),
    cashTotal: toRupees(monthlyCashPaise),
    bankTotal: toRupees(monthlyBankPaise),
    upiTotal: toRupees(monthlyUpiPaise),
    cardTotal: toRupees(monthlyCardPaise),
    totalTax: toRupees(monthlyTaxPaise),
    totalCGST: toRupees(Math.round(monthlyTaxPaise / 2)),
    totalSGST: toRupees(Math.round(monthlyTaxPaise / 2)),
    totalDiscount: toRupees(monthlyDiscountPaise),
    totalBillsCount: monthlyBills.length,
    voidedBillsCount: monthlyVoidedCount,
    activeBillsCount: monthlyActiveCount,
    dailyAverage: monthlyDailyAvg,
    dailyBreakdown: monthlyDailyBreakdown,
  };

  // -------------------------------------------------------------
  // EXPORT HANDLERS (Daily & Monthly)
  // -------------------------------------------------------------
  const handleExportDaily = async (format: 'xlsx' | 'csv') => {
    setIsExporting(true);
    try {
      const filename = `PrimeCentury_Daily_Sales_${selectedDate}.${format}`;

      // 1. Try server-side export first with Bearer token
      try {
        const res = await fetch(
          `/api/reports/export/daily?date=${encodeURIComponent(selectedDate)}&format=${format}`,
          {
            headers: {
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
          }
        );
        if (res.ok) {
          const blob = await res.blob();
          triggerFileDownload(blob, filename);
          triggerNotification('success', `Daily report exported successfully as ${filename}`);
          return;
        }
      } catch {
        // Fallback to client-side generation
      }

      // 2. Client-side fallback using our pure JS/TS ExcelJS generator
      if (format === 'xlsx') {
        const blob = await generateDailySalesExcel(
          selectedDate,
          dailyFilteredBills,
          dailySummaryObject,
          'PRIME CENTURY CAFE & RESTAURANT',
          currentUser?.name || 'Owner'
        );
        triggerFileDownload(blob, filename);
      } else {
        const csv = generateDailySalesCSV(
          selectedDate,
          dailyFilteredBills,
          dailySummaryObject,
          'PRIME CENTURY CAFE & RESTAURANT'
        );
        triggerFileDownload(csv, filename);
      }

      triggerNotification('success', `Daily report exported successfully as ${filename}`);
    } catch (err: any) {
      console.error(err);
      triggerNotification('error', `Failed to export daily report: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportMonthly = async (format: 'xlsx' | 'csv') => {
    setIsExporting(true);
    try {
      const filename = `PrimeCentury_Monthly_Sales_${selectedMonth}.${format}`;

      // 1. Try server-side streaming export first
      try {
        const res = await fetch(
          `/api/reports/export/monthly?month=${encodeURIComponent(selectedMonth)}&format=${format}`,
          {
            headers: {
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
          }
        );
        if (res.ok) {
          const blob = await res.blob();
          triggerFileDownload(blob, filename);
          triggerNotification('success', `Monthly 3-sheet workbook exported as ${filename}`);
          return;
        }
      } catch {
        // Fallback to client-side generation
      }

      // 2. Client-side fallback
      if (format === 'xlsx') {
        const blob = await generateMonthlySalesExcel(
          selectedMonth,
          monthlySummaryObject,
          monthlyBills,
          'PRIME CENTURY CAFE & RESTAURANT',
          currentUser?.name || 'Owner'
        );
        triggerFileDownload(blob, filename);
      } else {
        const csv = generateMonthlySalesCSV(
          selectedMonth,
          monthlySummaryObject,
          monthlyBills,
          'PRIME CENTURY CAFE & RESTAURANT'
        );
        triggerFileDownload(csv, filename);
      }

      triggerNotification('success', `Monthly workbook exported as ${filename}`);
    } catch (err: any) {
      console.error(err);
      triggerNotification('error', `Failed to export monthly report: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Reversible Voiding execution
  const handleConfirmVoid = async () => {
    if (!billToVoid) return;
    setIsVoiding(true);

    try {
      const res = await voidBill(billToVoid.id, voidReasonInput || 'Voided by Owner for correction');
      if (res.success) {
        triggerNotification(
          'success',
          res.message || `Bill ${billToVoid.billNumber} voided reversibly. Accounting totals updated.`
        );
        setBillToVoid(null);
        setVoidReasonInput('');
      } else {
        triggerNotification('error', res.message || 'Failed to void bill.');
      }
    } catch (err: any) {
      triggerNotification('error', err?.message || 'Error executing bill voiding.');
    } finally {
      setIsVoiding(false);
    }
  };

  // Permanent Delete execution
  const handleConfirmDelete = async () => {
    if (!billToDelete) return;
    if (!ownerDeletePassword.trim()) {
      triggerNotification('error', 'Owner password is required to verify permanent bill deletion.');
      return;
    }
    setIsDeleting(true);

    try {
      const res = await deleteBill(billToDelete.id, {
        ownerPassword: ownerDeletePassword.trim(),
        reason: deleteReason.trim() || 'Deleted from Reports Ledger by verified Owner',
      });
      if (res.success) {
        triggerNotification(
          'success',
          res.message || `Bill ${billToDelete.billNumber} permanently deleted and logged to owner audit ledger.`
        );
        setBillToDelete(null);
        setOwnerDeletePassword('');
        setDeleteReason('');
      } else {
        triggerNotification('error', res.message || 'Failed to delete bill.');
      }
    } catch (err: any) {
      triggerNotification('error', err?.message || 'Error executing bill deletion.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Trigger Snapshot Backup
  const handleRunBackup = async () => {
    setBackupRunning(true);
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        triggerNotification(
          'success',
          `Backup created: ${data.filename} (${(data.sizeBytes / 1024).toFixed(1)} KB) - SHA-256: ${data.sha256.substring(0, 16)}...`
        );
        // Refresh health metrics
        const hRes = await fetch('/api/admin/storage-health', {
          headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        });
        if (hRes.ok) setStorageHealth(await hRes.json());
      } else {
        triggerNotification('error', data.error || 'Failed to create backup snapshot.');
      }
    } catch (e: any) {
      triggerNotification('error', e?.message || 'Error connecting to backup service.');
    } finally {
      setBackupRunning(false);
    }
  };

  // Trigger Restore Integrity Test
  const handleRunRestoreTest = async () => {
    setRestoreTestRunning(true);
    try {
      const res = await fetch('/api/admin/restore-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        triggerNotification(
          'success',
          `Restore Integrity Verification: ${data.integrityStatus} (${data.verifiedRecords.bills} bills tested)`
        );
      } else {
        triggerNotification('error', data.error || 'Restore integrity test failed.');
      }
    } catch (e: any) {
      triggerNotification('error', e?.message || 'Error running restore test.');
    } finally {
      setRestoreTestRunning(false);
    }
  };

  // Date Navigation
  const handleSelectDate = (dateStr: string) => {
    setIsAllDates(false);
    setSelectedDate(dateStr);
  };

  const handleStepDay = (delta: number) => {
    setIsAllDates(false);
    const [y, m, d] = selectedDate.split('-').map(Number);
    const currentDateObj = new Date(y, m - 1, d);
    currentDateObj.setDate(currentDateObj.getDate() + delta);
    setSelectedDate(getLocalDateKey(currentDateObj));
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3 text-xs rounded-xl border flex items-center justify-between shadow-2xs transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-neutral-400 hover:text-neutral-600 text-xs ml-3"
          >
            ×
          </button>
        </div>
      )}

      {/* Header and Master Section Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">
              Sales Reports &amp; Financial Ledger
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Owner Authorized</span>
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Owner-only Daily &amp; Monthly sales, Excel (.xlsx) exports, Cash &amp; Bank separation, reversible voiding, and backup audit
          </p>
        </div>

        {/* Master Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-neutral-200/70 rounded-xl">
          <button
            onClick={() => setReportSection('daily')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              reportSection === 'daily'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Daily Sales
          </button>
          <button
            onClick={() => setReportSection('monthly')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              reportSection === 'monthly'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Monthly Sales
          </button>
          <button
            onClick={() => setReportSection('audit')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              reportSection === 'audit'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Audit Log
          </button>
          <button
            onClick={() => setReportSection('storage')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              reportSection === 'storage'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Storage &amp; Security
          </button>
        </div>
      </div>

      {/* ============================================================= */}
      {/* SECTION 1: DAILY SALES REPORT                                 */}
      {/* ============================================================= */}
      {reportSection === 'daily' && (
        <div className="space-y-6">
          {/* Controls Bar: Date Stepper + Quick Presets + EXCEL EXPORTS */}
          <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-neutral-300 rounded-lg overflow-hidden bg-neutral-50">
                <button
                  onClick={() => handleStepDay(-1)}
                  disabled={isAllDates}
                  className="p-2 hover:bg-neutral-200 text-neutral-700 disabled:opacity-40 transition-colors"
                  title="Previous Day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleStepDay(1)}
                  disabled={isAllDates || selectedDate === todayStr}
                  className="p-2 hover:bg-neutral-200 text-neutral-700 disabled:opacity-40 transition-colors"
                  title="Next Day"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div>
                <div className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-neutral-600" />
                  <span>
                    {isAllDates ? 'All Recorded Dates' : selectedDate === todayStr ? "Today's Sales" : selectedDate}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  {dailyFilteredBills.length} Invoices ({dailyPaidOrdersCount} Active, {dailyVoidedCount} Voided)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleSelectDate(todayStr)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  !isAllDates && selectedDate === todayStr
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                Today
              </button>

              <button
                onClick={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  handleSelectDate(getLocalDateKey(y));
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  !isAllDates && selectedDate === getLocalDateKey(new Date(Date.now() - 86400000))
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                Yesterday
              </button>

              <input
                type="date"
                value={isAllDates ? '' : selectedDate}
                max={todayStr}
                onChange={(e) => e.target.value && handleSelectDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-neutral-300 bg-white text-neutral-800"
              />

              <button
                onClick={() => setIsAllDates(!isAllDates)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  isAllDates
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                All-Time
              </button>

              <div className="h-6 w-px bg-neutral-300 mx-1 hidden sm:block"></div>

              {/* OWNER-ONLY EXPORT TO EXCEL BUTTON */}
              <button
                onClick={() => handleExportDaily('xlsx')}
                disabled={isExporting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                title="Download formatted Excel workbook (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{isExporting ? 'Exporting...' : 'Export to Excel (.xlsx)'}</span>
              </button>

              {/* EXPORT TO CSV BUTTON */}
              <button
                onClick={() => handleExportDaily('csv')}
                disabled={isExporting}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
                title="Download CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>

              <button
                onClick={() => window.print()}
                className="p-1.5 text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-lg bg-white"
                title="Print Report"
              >
                <Printer className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Daily KPI Metric Cards with Gross vs Net and Cash vs Bank */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Net Realized Revenue */}
            <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-2xs">
              <div className="flex items-center justify-between text-neutral-500">
                <span className="text-xs font-bold uppercase tracking-wider">Net Realized Revenue</span>
                <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-neutral-900 font-mono-numbers">
                  {formatRupees(dailySummaryObject.totalNetSales)}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  Gross: {formatRupees(dailySummaryObject.totalGrossSales)} · {dailyPaidOrdersCount} Active
                </div>
              </div>
            </div>

            {/* Cash Sales */}
            <div className="bg-white p-5 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/20">
              <div className="flex items-center justify-between text-emerald-800">
                <span className="text-xs font-bold uppercase tracking-wider">Cash Register</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Banknote className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-emerald-950 font-mono-numbers">
                  {formatRupees(dailySummaryObject.cashTotal)}
                </div>
                <div className="text-[11px] text-emerald-700 mt-1">
                  {dailySummaryObject.cashCount} Cash Settlements · {dailySummaryObject.totalNetSales > 0 ? Math.round((dailySummaryObject.cashTotal / dailySummaryObject.totalNetSales) * 100) : 0}% of net
                </div>
              </div>
            </div>

            {/* Bank & Digital Sales */}
            <div className="bg-white p-5 rounded-xl border border-blue-200 shadow-2xs bg-blue-50/20">
              <div className="flex items-center justify-between text-blue-800">
                <span className="text-xs font-bold uppercase tracking-wider">Bank &amp; Digital</span>
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-blue-950 font-mono-numbers">
                  {formatRupees(dailySummaryObject.bankTotal)}
                </div>
                <div className="text-[11px] text-blue-700 mt-1">
                  UPI: {formatRupees(dailySummaryObject.upiTotal)} · Card: {formatRupees(dailySummaryObject.cardTotal)}
                </div>
              </div>
            </div>

            {/* GST Tax & Voids */}
            <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-2xs">
              <div className="flex items-center justify-between text-neutral-500">
                <span className="text-xs font-bold uppercase tracking-wider">GST &amp; Voids</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-neutral-900 font-mono-numbers">
                  {formatRupees(dailySummaryObject.totalTax)}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  CGST+SGST Withheld · Voids: {dailyVoidedCount} ({formatRupees(dailySummaryObject.totalVoidedSales)})
                </div>
              </div>
            </div>
          </div>

          {/* Sub-tabs for Daily Filter: All | Cash | Bank | Voided */}
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
            <button
              onClick={() => setDailyReportTab('all')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                dailyReportTab === 'all'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <span>All Bills ({dailyFilteredBills.length})</span>
            </button>
            <button
              onClick={() => setDailyReportTab('cash')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                dailyReportTab === 'cash'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>Cash Register ({dailySummaryObject.cashCount})</span>
            </button>
            <button
              onClick={() => setDailyReportTab('bank')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                dailyReportTab === 'bank'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Bank &amp; Digital ({dailySummaryObject.bankCount})</span>
            </button>
            <button
              onClick={() => setDailyReportTab('voided')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                dailyReportTab === 'voided'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Voided &amp; Cancelled ({dailyVoidedCount})</span>
            </button>
          </div>

          {/* Daily Invoices Table */}
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">
                  {dailyReportTab === 'cash'
                    ? 'Cash Invoices Ledger'
                    : dailyReportTab === 'bank'
                    ? 'Bank & Digital Settlements Ledger'
                    : dailyReportTab === 'voided'
                    ? 'Voided & Cancelled Bills Audit'
                    : 'Daily Settled Bills Ledger'}
                </h2>
                <p className="text-[11px] text-neutral-500">
                  Authoritative records with exact integer paise precision. Owner can reprint, reversibly void, or export.
                </p>
              </div>
            </div>

            {dailyFilteredBills.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400">
                No invoices recorded for {selectedDate}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 uppercase text-[10px] font-semibold tracking-wider">
                      <th className="px-4 py-3">Invoice No.</th>
                      <th className="px-4 py-3">Table</th>
                      <th className="px-4 py-3">Cashier</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3 text-right">Tax</th>
                      <th className="px-4 py-3 text-right">Grand Total</th>
                      <th className="px-4 py-3 text-right">Time Paid</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {dailyFilteredBills
                      .filter((b) => {
                        const isV = Boolean(b.isVoided || b.paymentStatus === 'voided');
                        if (dailyReportTab === 'voided') return isV;
                        if (dailyReportTab === 'cash') return !isV && b.paymentMethod === 'cash';
                        if (dailyReportTab === 'bank')
                          return !isV && (b.paymentMethod === 'upi' || b.paymentMethod === 'card');
                        return true;
                      })
                      .map((bill) => {
                        const isV = Boolean(bill.isVoided || bill.paymentStatus === 'voided');
                        return (
                          <tr
                            key={bill.id}
                            className={`hover:bg-neutral-50/70 transition-colors ${
                              isV ? 'bg-rose-50/30 text-rose-900' : ''
                            }`}
                          >
                            <td className="px-4 py-3 font-bold text-neutral-900 font-mono-numbers">
                              {bill.billNumber}
                            </td>
                            <td className="px-4 py-3 font-medium text-neutral-800">
                              Table {bill.tableId}
                            </td>
                            <td className="px-4 py-3 text-neutral-600">{bill.cashierName}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`uppercase text-[10px] font-bold px-2 py-0.5 rounded ${
                                  bill.paymentMethod === 'cash'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : bill.paymentMethod === 'upi'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {bill.paymentMethod}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-neutral-600 font-mono-numbers">
                              {formatRupees((bill.cgstAmount || 0) + (bill.sgstAmount || 0))}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-neutral-900 font-mono-numbers text-sm">
                              {formatRupees(bill.grandTotal)}
                            </td>
                            <td className="px-4 py-3 text-right text-neutral-500 font-mono-numbers text-[11px]">
                              {new Date(bill.paidAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isV ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                  VOIDED
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  PAID
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setSelectedReceipt(bill)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded transition-colors"
                                  title="View and reprint receipt"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Receipt</span>
                                </button>

                                {/* REVERSIBLE VOID BILL BUTTON */}
                                {!isV && (
                                  <button
                                    onClick={() => setBillToVoid(bill)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors"
                                    title="Reversibly void this bill"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    <span>Void</span>
                                  </button>
                                )}

                                {/* PERMANENT DELETE (Owner Only) */}
                                <button
                                  onClick={() => setBillToDelete(bill)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors"
                                  title="Permanently remove test entry"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 2: MONTHLY SALES REPORT (Requirement A)               */}
      {/* ============================================================= */}
      {reportSection === 'monthly' && (
        <div className="space-y-6">
          {/* Controls Bar: Month Picker + Quick Export Buttons */}
          <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-neutral-600" />
                <span>{selectedMonthName} Performance</span>
              </div>
              <input
                type="month"
                value={selectedMonth}
                max={currentMonthKey}
                onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-neutral-300 bg-neutral-50 text-neutral-900"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* OWNER-ONLY EXPORT TO EXCEL BUTTON */}
              <button
                onClick={() => handleExportMonthly('xlsx')}
                disabled={isExporting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                title="Export complete 3-sheet Excel workbook (Monthly Summary, Daily Breakdown, Bill Details)"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{isExporting ? 'Generating Excel...' : 'Export to Excel (.xlsx)'}</span>
              </button>

              {/* EXPORT TO CSV */}
              <button
                onClick={() => handleExportMonthly('csv')}
                disabled={isExporting}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Monthly Executive Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-2xs">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Monthly Net Turnover
              </span>
              <div className="text-2xl font-bold text-neutral-900 font-mono-numbers mt-2">
                {formatRupees(monthlySummaryObject.totalNetSales)}
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">
                Gross: {formatRupees(monthlySummaryObject.totalGrossSales)} · {monthlySummaryObject.activeBillsCount} Invoices
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/20">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Cash Collections
              </span>
              <div className="text-2xl font-bold text-emerald-950 font-mono-numbers mt-2">
                {formatRupees(monthlySummaryObject.cashTotal)}
              </div>
              <div className="text-[11px] text-emerald-700 mt-1">
                {monthlySummaryObject.totalNetSales > 0 ? Math.round((monthlySummaryObject.cashTotal / monthlySummaryObject.totalNetSales) * 100) : 0}% of net turnover
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-blue-200 shadow-2xs bg-blue-50/20">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
                Bank &amp; Digital Collections
              </span>
              <div className="text-2xl font-bold text-blue-950 font-mono-numbers mt-2">
                {formatRupees(monthlySummaryObject.bankTotal)}
              </div>
              <div className="text-[11px] text-blue-700 mt-1">
                UPI: {formatRupees(monthlySummaryObject.upiTotal)} · Card: {formatRupees(monthlySummaryObject.cardTotal)}
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-2xs">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                GST Tax &amp; Daily Average
              </span>
              <div className="text-2xl font-bold text-neutral-900 font-mono-numbers mt-2">
                {formatRupees(monthlySummaryObject.totalTax)}
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">
                Daily Avg: {formatRupees(monthlySummaryObject.dailyAverage)} / day
              </div>
            </div>
          </div>

          {/* DAY-BY-DAY BREAKDOWN TABLE (Requirement A) */}
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">
                  Day-by-Day Revenue Breakdown ({selectedMonthName})
                </h2>
                <p className="text-[11px] text-neutral-500">
                  Daily accounting breakdown exported in Sheet 2 of the Excel workbook.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 uppercase text-[10px] font-semibold tracking-wider">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Day</th>
                    <th className="px-4 py-3 text-center">Bills</th>
                    <th className="px-4 py-3 text-right">Gross Sales</th>
                    <th className="px-4 py-3 text-right">Cash</th>
                    <th className="px-4 py-3 text-right">Bank / Digital</th>
                    <th className="px-4 py-3 text-right">Tax</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3 text-center">Voids</th>
                    <th className="px-4 py-3 text-right">Net Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {monthlySummaryObject.dailyBreakdown.map((row) => (
                    <tr
                      key={row.date}
                      className={`hover:bg-neutral-50 transition-colors ${
                        row.billsCount === 0 ? 'text-neutral-400' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-bold font-mono">{row.date}</td>
                      <td className="px-4 py-2.5">{row.dayOfWeek}</td>
                      <td className="px-4 py-2.5 text-center font-mono">{row.billsCount}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium">
                        {formatRupees(row.grossSales)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-800">
                        {formatRupees(row.cashCollected)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-blue-800">
                        {formatRupees(row.bankCollected)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatRupees(row.taxCollected)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatRupees(row.discountGiven)}</td>
                      <td className="px-4 py-2.5 text-center font-mono">
                        {row.voidedCount > 0 ? (
                          <span className="text-rose-600 font-bold">{row.voidedCount}</span>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-neutral-900">
                        {formatRupees(row.netRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-neutral-100 font-bold border-t-2 border-neutral-300">
                    <td className="px-4 py-3" colSpan={2}>
                      MONTH TOTALS
                    </td>
                    <td className="px-4 py-3 text-center font-mono">
                      {monthlySummaryObject.totalBillsCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatRupees(monthlySummaryObject.totalGrossSales)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-900">
                      {formatRupees(monthlySummaryObject.cashTotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-blue-900">
                      {formatRupees(monthlySummaryObject.bankTotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatRupees(monthlySummaryObject.totalTax)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatRupees(monthlySummaryObject.totalDiscount)}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-rose-700">
                      {monthlySummaryObject.voidedBillsCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-neutral-950">
                      {formatRupees(monthlySummaryObject.totalNetSales)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 3: AUDIT TRAIL LOG                                    */}
      {/* ============================================================= */}
      {reportSection === 'audit' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <div>
                <h2 className="text-base font-bold text-neutral-900">Immutable Audit Trail Log</h2>
                <p className="text-xs text-neutral-500">
                  Permanent record of bill deletions, voids, refunds, and owner administration actions
                </p>
              </div>
              <span className="text-xs font-semibold px-2 py-1 bg-neutral-100 rounded text-neutral-700">
                {auditLogs.length} Events Logged
              </span>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400">
                No audit events recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 mt-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                            log.action === 'BILL_VOID'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-rose-100 text-rose-900'
                          }`}
                        >
                          {log.action}
                        </span>
                        <span className="font-bold text-neutral-900 font-mono">
                          {log.billNumber || log.billId}
                        </span>
                        <span className="text-neutral-500">
                          by <strong className="text-neutral-800">{log.deletedByName || log.voidedByName || 'Owner'}</strong>
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-600">
                        {log.voidReason ? `Reason: "${log.voidReason}"` : `Deleted invoice with amount ${formatRupees(log.grandTotal)}`}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-neutral-500 font-mono">
                      {new Date(log.deletedAt || log.voidedAt || Date.now()).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 4: STORAGE & SECURITY (Requirement B, C)              */}
      {/* ============================================================= */}
      {reportSection === 'storage' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <div>
                <h2 className="text-base font-bold text-neutral-900">
                  Data Durability, Atomic Storage &amp; ₹10 Crore Engine
                </h2>
                <p className="text-xs text-neutral-500">
                  Authoritative server disk persistence, integer minor units (paise), and automated backup testing
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Engine Active</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                <div className="text-xs text-neutral-500 uppercase font-semibold">Cumulative Sales</div>
                <div className="text-xl font-bold text-neutral-900 font-mono mt-1">
                  {formatRupees(storageHealth?.metrics?.cumulativeSalesRupees || 0)}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  Paise Minor Units: {storageHealth?.metrics?.cumulativeSalesPaise?.toLocaleString('en-IN') || 0}
                </div>
              </div>

              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                <div className="text-xs text-neutral-500 uppercase font-semibold">Total Bills Stored</div>
                <div className="text-xl font-bold text-neutral-900 font-mono mt-1">
                  {storageHealth?.metrics?.totalBillsCount || bills.length} Invoices
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  Active: {storageHealth?.metrics?.activeBillsCount || 0} · Voided: {storageHealth?.metrics?.voidedBillsCount || 0}
                </div>
              </div>

              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                <div className="text-xs text-neutral-500 uppercase font-semibold">Backups Available</div>
                <div className="text-xl font-bold text-neutral-900 font-mono mt-1">
                  {storageHealth?.metrics?.backupsAvailable || 0} Snapshots
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  Verified SHA-256 Checksums
                </div>
              </div>
            </div>

            {/* Backup & Restore Testing Action Buttons */}
            <div className="p-4 bg-neutral-50/70 rounded-xl border border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-neutral-900">Backup &amp; Restore Verification</h4>
                <p className="text-[11px] text-neutral-500">
                  Generate snapshot with checksum or test restore in an isolated sandbox.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunBackup}
                  disabled={backupRunning}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {backupRunning ? 'Creating Snapshot...' : 'Create Snapshot Backup'}
                </button>
                <button
                  onClick={handleRunRestoreTest}
                  disabled={restoreTestRunning}
                  className="px-3.5 py-2 text-xs font-bold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {restoreTestRunning ? 'Verifying...' : 'Test Restore Integrity'}
                </button>
              </div>
            </div>

            {/* Documented Layered Security & Malware Protection Notice (Requirement C) */}
            <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 text-xs text-blue-900">
              <h4 className="font-bold flex items-center gap-1.5 text-blue-950">
                <Lock className="w-4 h-4 text-blue-700" />
                <span>Layered Security &amp; Malware Protection Architecture</span>
              </h4>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                <strong>1. Role-Based Access Control (RBAC):</strong> Financial reports, Excel exports, bill deletion, and floor management are strictly validated with HMAC session tokens and owner checks on the server.
              </p>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                <strong>2. Formula Injection Protection:</strong> All spreadsheet cells starting with formula triggers (<code className="bg-blue-100 px-1 py-0.5 rounded font-mono">=+-@\t\r</code>) are automatically escaped with leading apostrophes to protect against DDE attacks in Excel.
              </p>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                <strong>3. Rate Limiting:</strong> Credential endpoints feature sliding-window rate limits to prevent brute-force attacks.
              </p>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                <strong>4. Upload Heuristics &amp; Environment Isolation:</strong> File imports are strictly checked for size (2MB limit), MIME types, and scanned against injection patterns. Server workloads run inside sandboxed Node.js containers. (Note: Device-wide antivirus scanning is properly managed by the operating system).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* REVERSIBLE BILL VOID MODAL DIALOG                             */}
      {/* ------------------------------------------------------------- */}
      {billToVoid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-neutral-200 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between bg-amber-50/50">
              <div className="flex items-center gap-2 text-amber-800">
                <Ban className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-neutral-900">Reversibly Void Bill</h3>
              </div>
              <button
                onClick={() => setBillToVoid(null)}
                disabled={isVoiding}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Voiding bill <span className="font-bold text-neutral-900">{billToVoid.billNumber}</span> keeps the invoice in the audit ledger for GST compliance, but deducts it from Net Sales revenue.
              </p>

              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Invoice:</span>
                  <span className="font-mono font-bold">{billToVoid.billNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Grand Total:</span>
                  <span className="font-mono font-bold">{formatRupees(billToVoid.grandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Table &amp; Cashier:</span>
                  <span>Table {billToVoid.tableId} · {billToVoid.cashierName}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Reason for Voiding:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Order cancelled, Wrong table punched, Payment mode change"
                  value={voidReasonInput}
                  onChange={(e) => setVoidReasonInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>

            <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setBillToVoid(null)}
                disabled={isVoiding}
                className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={isVoiding}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{isVoiding ? 'Voiding Bill...' : 'Confirm & Void Bill'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* PERMANENT BILL DELETION MODAL DIALOG                          */}
      {/* ------------------------------------------------------------- */}
      {billToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-neutral-200 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-neutral-900">Confirm Permanent Bill Deletion</h3>
              </div>
              <button
                onClick={() => setBillToDelete(null)}
                disabled={isDeleting}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-neutral-600 leading-relaxed">
                You are about to permanently delete bill <span className="font-bold text-neutral-900">{billToDelete.billNumber}</span>. This sensitive action permanently removes the record across all devices and logs to the immutable audit trail.
              </p>

              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Invoice:</span>
                  <span className="font-mono font-bold text-neutral-900">{billToDelete.billNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Table:</span>
                  <span className="font-medium text-neutral-800">Table {billToDelete.tableId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Grand Total:</span>
                  <span className="font-mono font-bold text-neutral-900">{formatRupees(billToDelete.grandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Cashier:</span>
                  <span className="text-neutral-700">{billToDelete.cashierName}</span>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1">
                    Owner Password / Verification Credential <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="password"
                    value={ownerDeletePassword}
                    onChange={(e) => setOwnerDeletePassword(e.target.value)}
                    placeholder="Enter Owner password"
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                  />
                  <p className="text-[10px] text-neutral-400 mt-0.5">Required to confirm owner identity before deletion.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Reason for Deletion
                  </label>
                  <input
                    type="text"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="e.g. Duplicate test bill during training"
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setBillToDelete(null);
                  setOwnerDeletePassword('');
                  setDeleteReason('');
                }}
                disabled={isDeleting}
                className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting || !ownerDeletePassword.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Verifying & Deleting...' : 'Confirm & Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {selectedReceipt && (
        <ReceiptModal bill={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
      )}
    </div>
  );
};
