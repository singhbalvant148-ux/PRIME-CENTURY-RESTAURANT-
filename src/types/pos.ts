export type UserRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen';

export interface User {
  id: string;
  username: string;
  name: string;
  passwordHash: string;
  password?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export type TableStatus = 'available' | 'occupied' | 'billed';

export interface Floor {
  id: string;
  name: string;
  displayOrder?: number;
}

export interface Table {
  id: number;
  name: string;
  capacity: number;
  section: string; // Floor / section name e.g. 'Lower Hall', 'Upper Hall'
  floorId?: string;
  status: TableStatus;
  activeOrderId?: string;
  occupiedSince?: string;
}

export type MenuCategory = 'Starters' | 'Main Course' | 'Breads' | 'Rice' | 'Drinks' | string;

export interface Subcategory {
  id: string;
  name: string;
  category: string;
}

export interface MenuTimeSlot {
  startTime: string; // "11:00"
  endTime: string;   // "16:00"
  label?: string;
}

export interface MenuAvailabilityTiming {
  enabled: boolean;
  startTime?: string;
  endTime?: string;
  days?: string[];
  label?: string;
  timeSlots?: MenuTimeSlot[];
}

export interface MenuItem {
  id: string;
  section: string;
  subcategory: string;
  name: string;
  price: number;
  isAvailable: boolean;
  availabilityTiming?: MenuAvailabilityTiming;
  category?: MenuCategory;
  isVeg?: boolean;
  description?: string;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  isVeg: boolean;
  notes?: string;
  kotSentQuantity: number;
}

export type OrderStatus = 'active' | 'billed' | 'paid' | 'cancelled';

export interface Order {
  id: string;
  orderNumber: number;
  tableId: number;
  waiterName: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: string;
  notes?: string;
}

export type KOTStatus = 'new' | 'preparing' | 'ready' | 'served';

export interface KOTItem {
  menuItemId: string;
  name: string;
  quantity: number;
  notes?: string;
  isVeg: boolean;
}

export interface KOT {
  id: string;
  kotNumber: number;
  orderId: string;
  tableId: number;
  waiterName: string;
  items: KOTItem[];
  status: KOTStatus;
  createdAt: string;
  isPrinted?: boolean;
  printedAt?: string;
  printCount?: number;
}

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'split';

export interface Bill {
  id: string;
  billNumber: string;
  orderId: string;
  tableId: number;
  items: OrderItem[];
  subtotal: number;
  subtotalPaise?: number; // Integer minor units (Paise)
  discountType: 'percentage' | 'flat';
  discountValue: number;
  discountAmount: number;
  discountAmountPaise?: number;
  cgstRate: number;
  sgstRate: number;
  cgstAmount: number;
  cgstAmountPaise?: number;
  sgstAmount: number;
  sgstAmountPaise?: number;
  grandTotal: number;
  grandTotalPaise?: number;
  paymentMethod: PaymentMethod;
  // Specific collected payment allocations
  cashAmount?: number;
  bankAmount?: number; // Combined UPI & Card digital/bank settlement
  upiAmount?: number;
  cardAmount?: number;
  paymentStatus: 'paid' | 'unpaid' | 'voided';
  paidAt: string;
  cashierName: string;
  cashReceived?: number;
  changeGiven?: number;
  isPrinted?: boolean;
  printedAt?: string;
  printCount?: number;
  // Audit & Deletion / Void tracking
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  isVoided?: boolean;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  idempotencyKey?: string;
}

export interface DailySalesSummary {
  date: string;
  totalGrossSales: number;
  totalGrossSalesPaise: number;
  totalVoidedSales: number;
  totalVoidedSalesPaise: number;
  totalNetSales: number;
  totalNetSalesPaise: number;
  cashTotal: number;
  cashTotalPaise: number;
  cashCount: number;
  bankTotal: number;
  bankTotalPaise: number;
  bankCount: number;
  upiTotal: number;
  cardTotal: number;
  totalTax: number;
  totalTaxPaise: number;
  totalCGST: number;
  totalSGST: number;
  totalDiscount: number;
  totalOrders: number;
  voidedOrdersCount: number;
  avgOrderValue: number;
  topItems: [string, { qty: number; total: number; isVeg: boolean }][];
}

export interface DayBreakdownItem {
  date: string;
  dayOfWeek: string;
  billsCount: number;
  grossSales: number;
  cashCollected: number;
  bankCollected: number;
  taxCollected: number;
  discountGiven: number;
  voidedCount: number;
  voidedAmount: number;
  netRevenue: number;
}

export interface MonthlySalesSummary {
  month: string; // YYYY-MM
  monthName: string;
  year: number;
  totalGrossSales: number;
  totalNetSales: number;
  totalVoidedSales: number;
  cashTotal: number;
  bankTotal: number;
  upiTotal: number;
  cardTotal: number;
  totalTax: number;
  totalCGST: number;
  totalSGST: number;
  totalDiscount: number;
  totalBillsCount: number;
  voidedBillsCount: number;
  activeBillsCount: number;
  dailyAverage: number;
  dailyBreakdown: DayBreakdownItem[];
}

export type PrinterPaperWidth = '58mm' | '80mm';
export type PrinterMode = 'bluetooth' | 'system' | 'auto';
export type PrinterStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface RestaurantSettings {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  gstin: string;
  fssai: string;
  cgstRate: number; // e.g. 2.5 for 2.5%
  sgstRate: number; // e.g. 2.5 for 2.5%
  upiId: string;
  printerPaperWidth?: PrinterPaperWidth;
  printerMode?: PrinterMode;
  savedBluetoothDeviceName?: string;
  logoUrl?: string;
}
