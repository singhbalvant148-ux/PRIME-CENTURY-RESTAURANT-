import React, { useState, useMemo } from 'react';
import {
  Receipt,
  IndianRupee,
  Percent,
  CreditCard,
  QrCode,
  Banknote,
  Printer,
  CheckCircle2,
  AlertCircle,
  Tag,
  ChevronDown,
  ChevronUp,
  Search,
  Calendar,
  Filter,
  Trash2,
  Ban,
  Eye,
  AlertTriangle,
  X,
  History,
  Lock,
  Wifi,
  Sparkles,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { PaymentMethod, Bill } from '../types/pos';
import { ReceiptModal } from './ReceiptModal';
import { isOwner } from '../utils/security';

export const BillingView: React.FC = () => {
  const {
    tables,
    orders,
    bills,
    activeTableId,
    setActiveTableId,
    settings,
    updateSettings,
    generateBillForOrder,
    settleBill,
    deleteBill,
    voidBill,
    currentUser,
    printBillThermal,
    syncStatus,
  } = usePOS();

  const isOwnerUser = isOwner(currentUser);

  // Tab state: 'checkout' for current table billing, 'settled' for settled bills ledger
  const [activeTab, setActiveTab] = useState<'checkout' | 'settled'>('checkout');

  // Find tables with active or billed orders
  const billableTables = tables.filter((t) => {
    if (t.status === 'available') return false;
    const order = orders.find((o) => o.id === t.activeOrderId && o.status !== 'paid');
    return Boolean(order && order.items.length > 0);
  });

  const selectedTableId =
    activeTableId && billableTables.some((t) => t.id === activeTableId)
      ? activeTableId
      : billableTables[0]?.id || 1;

  const selectedTable = tables.find((t) => t.id === selectedTableId);
  const selectedOrder = orders.find(
    (o) => o.id === selectedTable?.activeOrderId && o.status !== 'paid'
  );

  // Billing checkout state
  const [discountType, setDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [customCgstRate, setCustomCgstRate] = useState<number>(settings.cgstRate);
  const [customSgstRate, setCustomSgstRate] = useState<number>(settings.sgstRate);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [isEditingTax, setIsEditingTax] = useState<boolean>(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  // Receipt modal state (used both after settling and when clicking View/Print Receipt from Settled Bills)
  const [receiptBillToView, setReceiptBillToView] = useState<Bill | null>(null);

  // Settled Bills Filtering & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | 'month' | 'custom'>('all');
  const [customDate, setCustomDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'upi' | 'card'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'voided'>('all');
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);

  // Owner Delete & Void Action states
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);
  const [ownerDeletePassword, setOwnerDeletePassword] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [billToVoid, setBillToVoid] = useState<Bill | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const triggerNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Direct Print Bill handler from checkout counter
  const handlePrintBill = async () => {
    if (!selectedOrder) return;
    console.info(`[BillingView] PRINT BILL requested for order #${selectedOrder.orderNumber} (Table ${selectedTableId})`);

    const items = selectedOrder.items || [];
    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    let discountAmount = 0;
    if (discountType === 'percentage') {
      discountAmount = Math.round(((subtotal * discountValue) / 100) * 100) / 100;
    } else {
      discountAmount = Math.min(discountValue, subtotal);
    }
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const cgstAmount = Math.round(((taxableAmount * customCgstRate) / 100) * 100) / 100;
    const sgstAmount = Math.round(((taxableAmount * customSgstRate) / 100) * 100) / 100;
    const grandTotal = Math.round(taxableAmount + cgstAmount + sgstAmount);
    const cashNum = parseFloat(cashTendered) || 0;
    const changeToReturn = Math.max(0, cashNum - grandTotal);

    const previewBill: Bill = {
      id: `bill-print-${Date.now()}`,
      billNumber: `INV-${new Date().getFullYear()}-${String(selectedOrder.orderNumber).padStart(4, '0')}`,
      orderId: selectedOrder.id,
      tableId: selectedTableId,
      items: [...items],
      subtotal,
      discountType,
      discountValue,
      discountAmount,
      cgstRate: customCgstRate,
      sgstRate: customSgstRate,
      cgstAmount,
      sgstAmount,
      grandTotal,
      paymentMethod,
      paymentStatus: 'unpaid',
      paidAt: new Date().toISOString(),
      cashierName: currentUser?.name || 'Cashier',
      cashReceived: paymentMethod === 'cash' ? cashNum : undefined,
      changeGiven: paymentMethod === 'cash' ? changeToReturn : undefined,
    };

    try {
      await printBillThermal(previewBill);
    } catch (err) {
      console.error('[BillingView] Error invoking bill print:', err);
    }
  };

  // Subtotal calculation for active checkout
  const items = selectedOrder?.items || [];
  const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  let discountAmount = 0;
  if (discountType === 'percentage') {
    discountAmount = Math.round(((subtotal * discountValue) / 100) * 100) / 100;
  } else {
    discountAmount = Math.min(discountValue, subtotal);
  }

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const cgstAmount = Math.round(((taxableAmount * customCgstRate) / 100) * 100) / 100;
  const sgstAmount = Math.round(((taxableAmount * customSgstRate) / 100) * 100) / 100;
  const grandTotal = Math.round(taxableAmount + cgstAmount + sgstAmount);

  const cashNum = parseFloat(cashTendered) || 0;
  const changeToReturn = Math.max(0, cashNum - grandTotal);

  const handleSettleAndPrint = () => {
    setBillingError(null);
    if (!selectedOrder) return;

    if (paymentMethod === 'cash' && cashTendered.trim() !== '' && cashNum < grandTotal) {
      setBillingError(
        `Cash received (₹${cashNum.toFixed(2)}) is less than total bill (₹${grandTotal.toFixed(2)}). Please collect full amount before settling.`
      );
      return;
    }

    if (customCgstRate !== settings.cgstRate || customSgstRate !== settings.sgstRate) {
      updateSettings({ cgstRate: customCgstRate, sgstRate: customSgstRate });
    }

    const newBill = generateBillForOrder(selectedOrder.id, discountType, discountValue);

    const effectiveCashReceived =
      paymentMethod === 'cash' ? (cashNum > 0 ? cashNum : grandTotal) : undefined;
    const effectiveChangeGiven =
      paymentMethod === 'cash' ? Math.max(0, (effectiveCashReceived || 0) - grandTotal) : undefined;

    const finalBill: Bill = {
      ...newBill,
      cgstRate: customCgstRate,
      sgstRate: customSgstRate,
      cgstAmount,
      sgstAmount,
      grandTotal,
      paymentMethod,
      paymentStatus: 'paid',
      cashReceived: effectiveCashReceived,
      changeGiven: effectiveChangeGiven,
      paidAt: new Date().toISOString(),
      cashierName: currentUser?.name || 'Cashier',
    };

    const success = settleBill(
      finalBill,
      paymentMethod,
      effectiveCashReceived,
      effectiveChangeGiven
    );

    if (success) {
      setReceiptBillToView(finalBill);
      setCashTendered('');
      setBillingError(null);
      triggerNotification('success', `Bill ${finalBill.billNumber} settled successfully and synchronized to cloud!`);
    } else {
      setBillingError('Failed to settle bill. Please check order and table details.');
    }
  };

  // -------------------------------------------------------------
  // SETTLED BILLS FILTERING & COMPUTATIONS
  // -------------------------------------------------------------
  const settledBills = useMemo(() => {
    return bills.filter((b) => !b.isDeleted);
  }, [bills]);

  const filteredSettledBills = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const currentMonthPrefix = todayStr.slice(0, 7);

    return settledBills.filter((bill) => {
      // Status filter
      const isV = Boolean(bill.isVoided || bill.paymentStatus === 'voided');
      if (statusFilter === 'paid' && isV) return false;
      if (statusFilter === 'voided' && !isV) return false;

      // Payment method filter
      if (paymentFilter !== 'all' && bill.paymentMethod !== paymentFilter) {
        return false;
      }

      // Date filter
      const billDateStr = (bill.paidAt || '').slice(0, 10);
      const billDate = new Date(bill.paidAt || '');

      if (dateFilter === 'today' && billDateStr !== todayStr) return false;
      if (dateFilter === 'yesterday' && billDateStr !== yesterdayStr) return false;
      if (dateFilter === '7days' && billDate < sevenDaysAgo) return false;
      if (dateFilter === 'month' && !billDateStr.startsWith(currentMonthPrefix)) return false;
      if (dateFilter === 'custom' && billDateStr !== customDate) return false;

      // Search query filter (matches bill number, table, cashier, order, items)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesBillNum = (bill.billNumber || '').toLowerCase().includes(query);
        const matchesTable = `table ${bill.tableId}`.toLowerCase().includes(query);
        const matchesCashier = (bill.cashierName || '').toLowerCase().includes(query);
        const matchesOrderId = (bill.orderId || '').toLowerCase().includes(query);
        const matchesItems = (bill.items || []).some((it) =>
          it.name.toLowerCase().includes(query)
        );

        if (!matchesBillNum && !matchesTable && !matchesCashier && !matchesOrderId && !matchesItems) {
          return false;
        }
      }

      return true;
    });
  }, [settledBills, statusFilter, paymentFilter, dateFilter, customDate, searchQuery]);

  // Aggregate metrics for settled bills
  const metrics = useMemo(() => {
    let totalGross = 0;
    let totalPaid = 0;
    let cashPaid = 0;
    let digitalPaid = 0;
    let voidedCount = 0;
    let voidedAmount = 0;

    filteredSettledBills.forEach((b) => {
      const isV = Boolean(b.isVoided || b.paymentStatus === 'voided');
      totalGross += b.grandTotal || 0;
      if (isV) {
        voidedCount++;
        voidedAmount += b.grandTotal || 0;
      } else {
        totalPaid += b.grandTotal || 0;
        if (b.paymentMethod === 'cash') {
          cashPaid += b.grandTotal || 0;
        } else {
          digitalPaid += b.grandTotal || 0;
        }
      }
    });

    return {
      count: filteredSettledBills.length,
      totalGross,
      totalPaid,
      cashPaid,
      digitalPaid,
      voidedCount,
      voidedAmount,
    };
  }, [filteredSettledBills]);

  // Handle Owner Permanent Deletion
  const handleConfirmDelete = async () => {
    if (!billToDelete) return;
    setDeleteError(null);

    if (!ownerDeletePassword.trim()) {
      setDeleteError('Owner verification password is required to authorize deletion.');
      return;
    }

    setIsDeleting(true);
    try {
      const res = await deleteBill(billToDelete.id, {
        ownerPassword: ownerDeletePassword.trim(),
        reason: deleteReason.trim() || 'Permanently deleted by Owner from Settled Bills view',
      });

      if (res.success) {
        triggerNotification(
          'success',
          res.message || `Bill ${billToDelete.billNumber} was permanently deleted and logged to audit trail.`
        );
        setBillToDelete(null);
        setOwnerDeletePassword('');
        setDeleteReason('');
      } else {
        setDeleteError(res.message || 'Server rejected bill deletion request.');
      }
    } catch (err: any) {
      setDeleteError(err?.message || 'Unexpected error executing bill deletion.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Owner Reversible Voiding
  const handleConfirmVoid = async () => {
    if (!billToVoid) return;
    setVoidError(null);

    const cleanReason = voidReason.trim() || 'Voided by Owner for correction';
    setIsVoiding(true);
    try {
      const res = await voidBill(billToVoid.id, cleanReason);
      if (res.success) {
        triggerNotification(
          'success',
          res.message || `Bill ${billToVoid.billNumber} voided reversibly and audit log recorded.`
        );
        setBillToVoid(null);
        setVoidReason('');
      } else {
        setVoidError(res.message || 'Server rejected bill void request.');
      }
    } catch (err: any) {
      setVoidError(err?.message || 'Unexpected error executing bill void.');
    } finally {
      setIsVoiding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-md animate-in fade-in ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-rose-50 border-rose-300 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-neutral-400 hover:text-neutral-700 p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header and Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-200">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-black p-1 shrink-0 shadow-xs ring-1 ring-neutral-900/10 flex items-center justify-center">
            <img
              src="/logo.svg"
              alt="Prime Century"
              className="w-full h-full object-contain rounded-lg"
            />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                Billing & Invoicing Area
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                  syncStatus === 'connected'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
                title="Cloud Database Synchronization"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Cloud Sync Live</span>
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Checkout open tables or search, view, and reprint finalized receipts across all connected devices
            </p>
          </div>
        </div>

        {/* Tab Navigation Switches */}
        <div className="flex items-center gap-2 p-1 bg-neutral-100 rounded-xl border border-neutral-200 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('checkout')}
            className={`flex items-center gap-2 px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'checkout'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Active Checkout</span>
            {billableTables.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  activeTab === 'checkout'
                    ? 'bg-emerald-500 text-neutral-950'
                    : 'bg-neutral-300 text-neutral-800'
                }`}
              >
                {billableTables.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settled')}
            className={`flex items-center gap-2 px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'settled'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Settled Bills & History</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeTab === 'settled'
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'bg-neutral-300 text-neutral-800'
              }`}
            >
              {settledBills.length}
            </span>
          </button>
        </div>
      </div>

      {/* ============================================================= */}
      {/* SECTION 1: ACTIVE CHECKOUT COUNTER                            */}
      {/* ============================================================= */}
      {activeTab === 'checkout' && (
        <div className="space-y-6">
          {/* Table Selector & Prominent PRINT BILL Button */}
          {billableTables.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-neutral-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-neutral-600">Select Table to Settle:</span>
                <div className="relative">
                  <select
                    value={selectedTableId}
                    onChange={(e) => setActiveTableId(Number(e.target.value))}
                    className="appearance-none bg-white font-bold text-neutral-900 text-xs py-2 pl-3 pr-8 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 shadow-2xs cursor-pointer"
                  >
                    {billableTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.section})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-3 pointer-events-none" />
                </div>
              </div>

              {/* Prominent Header PRINT BILL Button */}
              <button
                type="button"
                onClick={handlePrintBill}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-black text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg shadow-sm transition-all uppercase tracking-wider cursor-pointer"
                title="Print 58mm or 80mm thermal bill receipt"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>PRINT BILL PREVIEW</span>
              </button>
            </div>
          )}

          {billableTables.length === 0 || !selectedOrder || items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-200 p-10 text-center text-neutral-400 space-y-4">
              <Receipt className="w-12 h-12 mx-auto text-neutral-300 mb-2" />
              <h3 className="text-base font-semibold text-neutral-800">No tables pending billing</h3>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                All dining tables are currently free or have no active unbilled orders. You can view all previously settled receipts in the Settled Bills tab.
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => setActiveTab('settled')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-neutral-700" />
                  <span>View Settled Bills History ({settledBills.length} records)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Itemized Bill Details */}
              <div className="lg:col-span-7 bg-white rounded-xl border border-neutral-200 shadow-2xs p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
                  <div>
                    <h2 className="text-base font-bold text-neutral-900">
                      {selectedTable?.name} Invoice Details
                    </h2>
                    <p className="text-xs text-neutral-500">
                      Order #{selectedOrder.orderNumber} · Waiter: {selectedOrder.waiterName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrintBill}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
                      title="Print Thermal Receipt"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-600" />
                      <span>PRINT BILL</span>
                    </button>
                    <span className="text-xs font-semibold px-2 py-1 bg-amber-100 text-amber-900 rounded-lg">
                      Unpaid Bill
                    </span>
                  </div>
                </div>

                {/* Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 text-neutral-500 text-[10px] uppercase font-bold">
                        <th className="pb-2">Dish Item</th>
                        <th className="pb-2 text-center">Qty</th>
                        <th className="pb-2 text-right">Rate</th>
                        <th className="pb-2 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {items.map((item) => (
                        <tr key={item.id} className="py-2">
                          <td className="py-2.5">
                            <div className="font-semibold text-neutral-900 flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  item.isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                                }`}
                              ></span>
                              <span>{item.name}</span>
                            </div>
                            {item.notes && (
                              <div className="text-[10px] text-amber-700 italic pl-3.5">
                                {item.notes}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 text-center font-bold font-mono-numbers text-neutral-800">
                            {item.quantity}
                          </td>
                          <td className="py-2.5 text-right font-mono-numbers text-neutral-600">
                            ₹{item.price}
                          </td>
                          <td className="py-2.5 text-right font-bold font-mono-numbers text-neutral-900">
                            ₹{item.price * item.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Configurable Taxes Banner */}
                <div className="p-3.5 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-800 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-neutral-600" />
                      Tax & GST Configuration
                    </span>
                    <button
                      onClick={() => setIsEditingTax(!isEditingTax)}
                      className="text-[11px] font-semibold text-neutral-800 hover:underline cursor-pointer"
                    >
                      {isEditingTax ? 'Done' : 'Change Tax %'}
                    </button>
                  </div>

                  {isEditingTax ? (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-200">
                      <div>
                        <label className="block text-[10px] font-medium text-neutral-600 mb-0.5">
                          CGST Rate (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={customCgstRate}
                          onChange={(e) => setCustomCgstRate(Number(e.target.value))}
                          className="w-full px-2 py-1 text-xs border border-neutral-300 rounded font-mono-numbers"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-neutral-600 mb-0.5">
                          SGST Rate (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={customSgstRate}
                          onChange={(e) => setCustomSgstRate(Number(e.target.value))}
                          className="w-full px-2 py-1 text-xs border border-neutral-300 rounded font-mono-numbers"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between text-[11px] text-neutral-500">
                      <span>
                        Current: CGST {customCgstRate}% + SGST {customSgstRate}% (Total{' '}
                        {customCgstRate + customSgstRate}%)
                      </span>
                      <span>GSTIN: {settings.gstin}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Calculations & Payment Method */}
              <div className="lg:col-span-5 space-y-5">
                {/* Discount & Calculations Card */}
                <div className="bg-white rounded-xl border border-neutral-200 shadow-2xs p-5 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Discounts & Totals
                  </h3>

                  {/* Discount Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                      Apply Discount
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center p-0.5 bg-neutral-100 rounded-lg text-xs">
                        <button
                          type="button"
                          onClick={() => setDiscountType('percentage')}
                          className={`px-2.5 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                            discountType === 'percentage'
                              ? 'bg-neutral-900 text-white'
                              : 'text-neutral-600'
                          }`}
                        >
                          % Percent
                        </button>
                        <button
                          type="button"
                          onClick={() => setDiscountType('flat')}
                          className={`px-2.5 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                            discountType === 'flat'
                              ? 'bg-neutral-900 text-white'
                              : 'text-neutral-600'
                          }`}
                        >
                          ₹ Flat
                        </button>
                      </div>

                      <div className="relative flex-1">
                        <input
                          type="number"
                          min="0"
                          value={discountValue}
                          onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                          placeholder={discountType === 'percentage' ? 'e.g. 10' : 'e.g. 50'}
                          className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono-numbers"
                        />
                      </div>
                    </div>

                    {/* Quick discount chips */}
                    <div className="flex items-center gap-1.5 mt-2">
                      {[0, 5, 10, 15, 20].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            setDiscountType('percentage');
                            setDiscountValue(pct);
                          }}
                          className="px-2 py-0.5 text-[10px] font-semibold bg-neutral-100 hover:bg-neutral-200 rounded text-neutral-700 transition-colors cursor-pointer"
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Price Calculation Summary */}
                  <div className="space-y-2 pt-3 border-t border-neutral-200 text-xs">
                    <div className="flex justify-between text-neutral-600">
                      <span>Subtotal</span>
                      <span className="font-mono-numbers font-medium">₹{subtotal.toFixed(2)}</span>
                    </div>

                    {discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-700 font-medium">
                        <span>Discount</span>
                        <span className="font-mono-numbers">- ₹{discountAmount.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-neutral-600">
                      <span>CGST ({customCgstRate}%)</span>
                      <span className="font-mono-numbers">₹{cgstAmount.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-neutral-600">
                      <span>SGST ({customSgstRate}%)</span>
                      <span className="font-mono-numbers">₹{sgstAmount.toFixed(2)}</span>
                    </div>

                    {/* Grand Total */}
                    <div className="flex justify-between items-baseline pt-3 border-t-2 border-neutral-900">
                      <span className="text-sm font-bold text-neutral-900 uppercase">
                        Grand Total:
                      </span>
                      <span className="text-2xl font-black text-neutral-900 font-mono-numbers">
                        ₹{grandTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Modes Card */}
                <div className="bg-white rounded-xl border border-neutral-200 shadow-2xs p-5 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Payment Method
                  </h3>

                  {/* 3 Payment Mode Buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                        paymentMethod === 'cash'
                          ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                          : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50 text-neutral-700'
                      }`}
                    >
                      <Banknote className="w-5 h-5" />
                      <span className="text-xs font-bold">Cash</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('upi')}
                      className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                        paymentMethod === 'upi'
                          ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                          : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50 text-neutral-700'
                      }`}
                    >
                      <QrCode className="w-5 h-5" />
                      <span className="text-xs font-bold">UPI QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('card')}
                      className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                        paymentMethod === 'card'
                          ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                          : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50 text-neutral-700'
                      }`}
                    >
                      <CreditCard className="w-5 h-5" />
                      <span className="text-xs font-bold">Card</span>
                    </button>
                  </div>

                  {/* Payment Specific Input Sections */}
                  {paymentMethod === 'cash' && (
                    <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                          Cash Received (₹)
                        </label>
                        <input
                          type="number"
                          placeholder={`Enter amount (e.g. ₹${Math.ceil(grandTotal / 100) * 100})`}
                          value={cashTendered}
                          onChange={(e) => setCashTendered(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-bold rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono-numbers"
                        />
                      </div>

                      {cashNum > 0 && (
                        <div className="flex justify-between items-center pt-2 border-t border-neutral-200 text-xs">
                          <span className="text-neutral-600 font-medium">Change to Return:</span>
                          <span
                            className={`text-base font-bold font-mono-numbers ${
                              changeToReturn >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {cashNum < grandTotal
                              ? `Needs ₹${(grandTotal - cashNum).toFixed(2)} more`
                              : `₹${changeToReturn.toFixed(2)}`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {paymentMethod === 'upi' && (
                    <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-center space-y-2">
                      <div className="w-32 h-32 mx-auto bg-white p-2 rounded-lg border border-neutral-300 flex items-center justify-center shadow-2xs">
                        <QrCode className="w-24 h-24 text-neutral-900" />
                      </div>
                      <div className="text-xs">
                        <div className="font-bold text-neutral-900">Scan UPI QR to Pay</div>
                        <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                          VPA: {settings.upiId}
                        </div>
                        <div className="text-sm font-extrabold text-neutral-900 font-mono-numbers mt-1">
                          Pay Exact: ₹{grandTotal.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'card' && (
                    <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-600 flex items-center gap-3">
                      <CreditCard className="w-6 h-6 text-neutral-700 shrink-0" />
                      <div>
                        <div className="font-semibold text-neutral-900">Card POS Terminal</div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          Swipe/Tap card for ₹{grandTotal.toFixed(2)} on POS terminal, then click Mark Paid.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Prominent PRINT BILL Button */}
                  <button
                    type="button"
                    onClick={handlePrintBill}
                    className="w-full py-3.5 px-4 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-black rounded-xl transition-all shadow-md flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-emerald-400" />
                    <span>PRINT BILL (₹{grandTotal.toFixed(2)})</span>
                  </button>

                  {billingError && (
                    <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg animate-in fade-in">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{billingError}</span>
                    </div>
                  )}

                  {/* Settle & Print Primary Button */}
                  <button
                    type="button"
                    onClick={handleSettleAndPrint}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Mark Bill as Paid & Settle (₹{grandTotal.toFixed(2)})</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 2: SETTLED BILLS & BILLING HISTORY                    */}
      {/* ============================================================= */}
      {activeTab === 'settled' && (
        <div className="space-y-6">
          {/* Metrics Overview Bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                Total Invoices
              </span>
              <div className="text-xl font-black text-neutral-900 mt-0.5 font-mono-numbers">
                {metrics.count}
              </div>
              <span className="text-[10px] text-neutral-500">Matching criteria</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                Paid Net Sales
              </span>
              <div className="text-xl font-black text-emerald-700 mt-0.5 font-mono-numbers">
                ₹{metrics.totalPaid.toFixed(2)}
              </div>
              <span className="text-[10px] text-neutral-500">Excluding voided</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                Cash Collected
              </span>
              <div className="text-xl font-black text-blue-700 mt-0.5 font-mono-numbers">
                ₹{metrics.cashPaid.toFixed(2)}
              </div>
              <span className="text-[10px] text-neutral-500">Cash register drawer</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs">
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                UPI & Card
              </span>
              <div className="text-xl font-black text-purple-700 mt-0.5 font-mono-numbers">
                ₹{metrics.digitalPaid.toFixed(2)}
              </div>
              <span className="text-[10px] text-neutral-500">Digital bank receipts</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs col-span-2 md:col-span-1">
              <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">
                Voided Bills
              </span>
              <div className="text-xl font-black text-rose-700 mt-0.5 font-mono-numbers">
                {metrics.voidedCount} (₹{metrics.voidedAmount.toFixed(0)})
              </div>
              <span className="text-[10px] text-neutral-500">Reversibly cancelled</span>
            </div>
          </div>

          {/* Search & Filters Controls Box */}
          <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Search Bar */}
              <div className="md:col-span-5 relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Bill #, Table, Waiter, Cashier, Item..."
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Date Filter Buttons */}
              <div className="md:col-span-7 flex flex-wrap items-center gap-1.5 justify-start md:justify-end">
                <span className="text-[11px] font-semibold text-neutral-500 mr-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-neutral-400" /> Date:
                </span>
                {(
                  [
                    { id: 'all', label: 'All Time' },
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: '7days', label: '7 Days' },
                    { id: 'month', label: 'This Month' },
                    { id: 'custom', label: 'Custom' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setDateFilter(tab.id)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      dateFilter === tab.id
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}

                {dateFilter === 'custom' && (
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="px-2 py-1 text-xs font-bold rounded-lg border border-neutral-300 bg-white text-neutral-800"
                  />
                )}
              </div>
            </div>

            {/* Sub-Filters: Payment Mode & Status Filter */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-neutral-500">Mode:</span>
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'cash', label: 'Cash' },
                    { id: 'upi', label: 'UPI' },
                    { id: 'card', label: 'Card' },
                  ] as const
                ).map((pm) => (
                  <button
                    key={pm.id}
                    onClick={() => setPaymentFilter(pm.id)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md cursor-pointer transition-colors ${
                      paymentFilter === pm.id
                        ? 'bg-neutral-800 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-neutral-500">Status:</span>
                {(
                  [
                    { id: 'all', label: 'All Status' },
                    { id: 'paid', label: 'Paid Only' },
                    { id: 'voided', label: 'Voided Only' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setStatusFilter(st.id)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md cursor-pointer transition-colors ${
                      statusFilter === st.id
                        ? 'bg-neutral-800 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}

                {(searchQuery || dateFilter !== 'all' || paymentFilter !== 'all' || statusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setDateFilter('all');
                      setPaymentFilter('all');
                      setStatusFilter('all');
                    }}
                    className="text-[11px] font-semibold text-neutral-500 hover:text-rose-600 underline ml-2 cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Settled Bills Table Card */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-neutral-50/60">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Settled Invoices Ledger ({filteredSettledBills.length})
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Shared real-time cloud data. All staff can view and reprint receipts.
                  {isOwnerUser && (
                    <span className="font-semibold text-neutral-700 ml-1">
                      (Owner authorized for reversible voiding and protected deletion)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {filteredSettledBills.length === 0 ? (
              <div className="p-12 text-center text-neutral-400 space-y-2">
                <Receipt className="w-10 h-10 mx-auto text-neutral-300" />
                <p className="text-sm font-semibold text-neutral-700">No settled bills found</p>
                <p className="text-xs text-neutral-400">
                  No bills matched the selected date, search query, or status filters.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 uppercase text-[10px] font-semibold tracking-wider">
                      <th className="px-4 py-3">Invoice No.</th>
                      <th className="px-4 py-3">Order / Table</th>
                      <th className="px-4 py-3">Date & Time</th>
                      <th className="px-4 py-3">Items</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3 text-right">Subtotal</th>
                      <th className="px-4 py-3 text-right">Tax (GST)</th>
                      <th className="px-4 py-3 text-right">Grand Total</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filteredSettledBills.map((bill) => {
                      const isV = Boolean(bill.isVoided || bill.paymentStatus === 'voided');
                      const isExpanded = expandedBillId === bill.id;
                      const itemsCount = (bill.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0);
                      const taxTotal = (bill.cgstAmount || 0) + (bill.sgstAmount || 0);

                      return (
                        <React.Fragment key={bill.id}>
                          <tr
                            className={`hover:bg-neutral-50/70 transition-colors ${
                              isV ? 'bg-rose-50/30' : ''
                            }`}
                          >
                            {/* Bill Number */}
                            <td className="px-4 py-3">
                              <div className="font-bold text-neutral-900 font-mono-numbers">
                                {bill.billNumber}
                              </div>
                              <div className="text-[10px] text-neutral-400">
                                Cashier: {bill.cashierName}
                              </div>
                            </td>

                            {/* Order & Table */}
                            <td className="px-4 py-3">
                              <div className="font-semibold text-neutral-800">
                                Table {bill.tableId}
                              </div>
                              <div className="text-[10px] text-neutral-500 font-mono">
                                {bill.orderId ? `Order #${bill.orderId.replace('ord-', '').slice(0, 6)}` : 'Dine-in'}
                              </div>
                            </td>

                            {/* Date & Time */}
                            <td className="px-4 py-3 text-neutral-600">
                              <div className="font-medium text-neutral-800">
                                {bill.paidAt
                                  ? new Date(bill.paidAt).toLocaleDateString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                                  : '—'}
                              </div>
                              <div className="text-[10px] text-neutral-400 font-mono-numbers">
                                {bill.paidAt
                                  ? new Date(bill.paidAt).toLocaleTimeString('en-IN', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : ''}
                              </div>
                            </td>

                            {/* Items count & toggle */}
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setExpandedBillId(isExpanded ? null : bill.id)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors cursor-pointer"
                                title="Click to inspect dish items breakdown"
                              >
                                <span>{itemsCount} items</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                            </td>

                            {/* Payment Method Badge */}
                            <td className="px-4 py-3">
                              <span
                                className={`uppercase text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                                  bill.paymentMethod === 'cash'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : bill.paymentMethod === 'upi'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {bill.paymentMethod === 'cash' && <Banknote className="w-3 h-3" />}
                                {bill.paymentMethod === 'upi' && <QrCode className="w-3 h-3" />}
                                {bill.paymentMethod === 'card' && <CreditCard className="w-3 h-3" />}
                                <span>{bill.paymentMethod}</span>
                              </span>
                              {bill.paymentMethod === 'cash' && bill.cashReceived && (
                                <div className="text-[10px] text-neutral-400 font-mono-numbers mt-0.5">
                                  Tender: ₹{bill.cashReceived}
                                </div>
                              )}
                            </td>

                            {/* Subtotal */}
                            <td className="px-4 py-3 text-right font-mono-numbers text-neutral-600">
                              ₹{(bill.subtotal || 0).toFixed(2)}
                              {bill.discountAmount > 0 && (
                                <div className="text-[10px] text-emerald-600 font-mono-numbers">
                                  -₹{bill.discountAmount.toFixed(2)} off
                                </div>
                              )}
                            </td>

                            {/* Tax */}
                            <td className="px-4 py-3 text-right font-mono-numbers text-neutral-600">
                              ₹{taxTotal.toFixed(2)}
                            </td>

                            {/* Grand Total */}
                            <td className="px-4 py-3 text-right font-mono-numbers font-bold text-neutral-900 text-sm">
                              ₹{(bill.grandTotal || 0).toFixed(2)}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3 text-center">
                              {isV ? (
                                <span
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800"
                                  title={bill.voidReason ? `Reason: ${bill.voidReason}` : 'Voided by Owner'}
                                >
                                  VOIDED
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  PAID
                                </span>
                              )}
                            </td>

                            {/* Actions Column */}
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* VIEW & PRINT RECEIPT BUTTON (All staff roles) */}
                                <button
                                  type="button"
                                  onClick={() => setReceiptBillToView(bill)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
                                  title="View and print thermal receipt"
                                >
                                  <Printer className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Print</span>
                                </button>

                                {/* REVERSIBLE VOID BILL BUTTON (Owner Only) */}
                                {isOwnerUser && !isV && (
                                  <button
                                    type="button"
                                    onClick={() => setBillToVoid(bill)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                                    title="Reversibly void this bill (Owner only)"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    <span>Void</span>
                                  </button>
                                )}

                                {/* PERMANENT DELETE BILL BUTTON (Owner Only) */}
                                {isOwnerUser && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBillToDelete(bill);
                                      setOwnerDeletePassword('');
                                      setDeleteReason('');
                                      setDeleteError(null);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                                    title="Permanently delete bill with owner verification"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Itemized Row Breakdown */}
                          {isExpanded && (
                            <tr className="bg-neutral-50/80 border-b border-neutral-200">
                              <td colSpan={10} className="px-6 py-3">
                                <div className="p-3 bg-white rounded-lg border border-neutral-200 shadow-2xs space-y-2">
                                  <div className="flex items-center justify-between text-xs font-bold text-neutral-800">
                                    <span>Itemized Dishes for Invoice {bill.billNumber}</span>
                                    <span className="text-[11px] text-neutral-500 font-normal">
                                      {bill.isVoided && `(Voided by ${bill.voidedBy || 'Owner'}: "${bill.voidReason || 'No reason given'}")`}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                                    {(bill.items || []).map((it, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center justify-between p-2 rounded bg-neutral-50 border border-neutral-100"
                                      >
                                        <div className="flex items-center gap-1.5 truncate">
                                          <span
                                            className={`w-2 h-2 rounded-full shrink-0 ${
                                              it.isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                                            }`}
                                          ></span>
                                          <span className="font-semibold text-neutral-800 truncate">
                                            {it.name}
                                          </span>
                                          <span className="text-neutral-500 font-mono-numbers">
                                            x{it.quantity}
                                          </span>
                                        </div>
                                        <span className="font-bold font-mono-numbers text-neutral-900 ml-2">
                                          ₹{((it.price || 0) * (it.quantity || 1)).toFixed(2)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
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
      {/* OWNER-ONLY REVERSIBLE VOID BILL MODAL DIALOG                  */}
      {/* ============================================================= */}
      {billToVoid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full border border-neutral-200 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-amber-50">
              <div className="flex items-center gap-2 text-amber-800">
                <Ban className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-bold text-neutral-900">Confirm Reversible Bill Void</h3>
              </div>
              <button
                onClick={() => setBillToVoid(null)}
                disabled={isVoiding}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-neutral-600 leading-relaxed">
                You are voiding invoice <span className="font-bold text-neutral-900">{billToVoid.billNumber}</span> (Table {billToVoid.tableId}, ₹{billToVoid.grandTotal.toFixed(2)}).
                This action is accounting-safe: the historical record is preserved, and daily sales totals will adjust automatically.
              </p>

              {voidError && (
                <div className="p-2.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{voidError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Reason for Voiding <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Customer returned food, order cancelled before preparation"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setBillToVoid(null)}
                disabled={isVoiding}
                className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={isVoiding}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{isVoiding ? 'Voiding Bill...' : 'Confirm & Void Bill'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* OWNER-ONLY PERMANENT BILL DELETION MODAL DIALOG               */}
      {/* ============================================================= */}
      {billToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-neutral-200 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between bg-rose-50/70">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-neutral-900">Owner Verification: Delete Bill</h3>
              </div>
              <button
                onClick={() => {
                  setBillToDelete(null);
                  setOwnerDeletePassword('');
                  setDeleteReason('');
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Warning: Sensitive Destructive Operation!</span>
                  <p className="mt-0.5 text-rose-800">
                    This permanently removes bill <span className="font-bold">{billToDelete.billNumber}</span> from the database across all devices. The deletion will be permanently logged to the immutable audit trail.
                  </p>
                </div>
              </div>

              {/* Bill Details Summary */}
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Invoice Number:</span>
                  <span className="font-mono font-bold text-neutral-900">{billToDelete.billNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Table:</span>
                  <span className="font-medium text-neutral-800">Table {billToDelete.tableId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Grand Total:</span>
                  <span className="font-mono font-bold text-neutral-900">₹{billToDelete.grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Settled By Cashier:</span>
                  <span className="text-neutral-700">{billToDelete.cashierName}</span>
                </div>
              </div>

              {deleteError && (
                <div className="p-2.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              {/* Owner Re-Authentication Credential Input */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-rose-600" />
                    <span>Owner Verification Password <span className="text-rose-600">*</span></span>
                  </label>
                  <input
                    type="password"
                    required
                    value={ownerDeletePassword}
                    onChange={(e) => setOwnerDeletePassword(e.target.value)}
                    placeholder="Enter Owner password"
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                  />
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    Backend verification requires the authenticated Owner's password to authorize deletion.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Reason for Deletion <span className="text-neutral-400 font-normal">(Required for Audit Trail)</span>
                  </label>
                  <input
                    type="text"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="e.g. Duplicate test receipt created during training"
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
                  setDeleteError(null);
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
                <span>{isDeleting ? 'Verifying & Deleting...' : 'Confirm & Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* RECEIPT MODAL PREVIEW & PRINT (Preserves Existing Bill Format) */}
      {/* ============================================================= */}
      {receiptBillToView && (
        <ReceiptModal
          bill={receiptBillToView}
          onClose={() => {
            setReceiptBillToView(null);
          }}
        />
      )}
    </div>
  );
};
