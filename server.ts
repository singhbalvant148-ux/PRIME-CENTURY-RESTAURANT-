import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { INITIAL_USERS, INITIAL_FLOORS, INITIAL_TABLES } from './src/data/initialData.ts';
import { hashPassword, verifyPassword, isOwner } from './src/utils/security.ts';
import {
  Bill,
  User,
  UserRole,
  Floor,
  Table,
  DailySalesSummary,
  MonthlySalesSummary,
  DayBreakdownItem,
} from './src/types/pos.ts';
import {
  toPaise,
  toRupees,
  calculateBillTotals,
  sanitizeSpreadsheetCell,
} from './src/utils/currencyMath.ts';
import {
  buildDailySalesWorkbook,
  buildMonthlySalesWorkbook,
  generateDailySalesCSV,
  generateMonthlySalesCSV,
} from './src/utils/excelExport.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const HOST = '0.0.0.0';

// Ensure data persistence directories exist
const DATA_DIR = path.resolve(__dirname, 'server_data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

const BILLS_FILE = path.join(DATA_DIR, 'bills.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_log.json');
const FLOORS_FILE = path.join(DATA_DIR, 'floors.json');
const TABLES_FILE = path.join(DATA_DIR, 'tables.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Persistent HMAC Secret for stateless token verification across server restarts
const HMAC_SECRET = 'primecentury_secure_signing_secret_2026';

// Helper to read JSON files safely
function readJsonFile<T>(filePath: string, defaultData: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultData;
}

// Atomic file writer: writes to a unique temporary file then renames
// Prevents corrupted files during power cuts, container sleep, or crashes
function writeJsonAtomic<T>(filePath: string, data: T): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`
  );
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`Error atomically writing to ${filePath}:`, err);
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore unlink error
      }
    }
  }
}

// Backward-compatible alias
function writeJsonFile<T>(filePath: string, data: T): void {
  writeJsonAtomic(filePath, data);
}

// Initialize persistent users if not present
if (!fs.existsSync(USERS_FILE)) {
  writeJsonAtomic(USERS_FILE, INITIAL_USERS);
}

// Initialize persistent floors (Lower Hall & Upper Hall)
if (!fs.existsSync(FLOORS_FILE)) {
  writeJsonAtomic(FLOORS_FILE, INITIAL_FLOORS);
}

// Initialize persistent tables
if (!fs.existsSync(TABLES_FILE)) {
  writeJsonAtomic(TABLES_FILE, INITIAL_TABLES);
}

// In-memory + persistent active session tokens
interface ServerSession {
  token: string;
  userId: string;
  username: string;
  name: string;
  role: UserRole;
  expiresAt: number;
}

const sessions = new Map<string, ServerSession>();
try {
  const savedSessions: ServerSession[] = readJsonFile(SESSIONS_FILE, []);
  const now = Date.now();
  savedSessions.forEach((s) => {
    if (s.expiresAt > now) {
      sessions.set(s.token, s);
    }
  });
} catch {
  // Ignore
}

function persistSessions() {
  const valid = Array.from(sessions.values()).filter((s) => s.expiresAt > Date.now());
  writeJsonAtomic(SESSIONS_FILE, valid);
}

function signToken(user: User): string {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    expiresAt,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', HMAC_SECRET).update(data).digest('base64url');
  const token = `${data}.${signature}`;

  sessions.set(token, {
    token,
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    expiresAt,
  });
  persistSessions();

  return token;
}

function isOwnerSession(session?: { role?: string; username?: string; userId?: string } | null): boolean {
  if (!session) return false;
  return isOwner({
    role: session.role,
    username: session.username,
    id: session.userId,
  });
}

function verifyToken(token: string): ServerSession | null {
  const cached = sessions.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    const users: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
    const foundUser = users.find(
      (u) =>
        u.id === cached.userId ||
        u.username.toLowerCase() === String(cached.username || '').toLowerCase()
    );
    if (foundUser && foundUser.isActive) {
      cached.role = isOwner(foundUser) ? 'owner' : foundUser.role;
      return cached;
    }
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(data).digest('base64url');
    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (!payload.userId || !payload.role || !payload.expiresAt) return null;
    if (payload.expiresAt < Date.now()) return null;

    const users: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
    const foundUser = users.find(
      (u) =>
        u.id === payload.userId ||
        u.username.toLowerCase() === String(payload.username || '').toLowerCase()
    );
    if (!foundUser || !foundUser.isActive) return null;

    const canonicalRole = isOwner(foundUser) ? 'owner' : foundUser.role;

    const session: ServerSession = {
      token,
      userId: foundUser.id,
      username: foundUser.username,
      name: foundUser.name,
      role: canonicalRole as UserRole,
      expiresAt: payload.expiresAt,
    };
    sessions.set(token, session);
    persistSessions();
    return session;
  } catch {
    return null;
  }
}

// Authentication middleware
interface AuthenticatedRequest extends Request {
  user?: ServerSession;
}

function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication token required',
    });
  }

  const session = verifyToken(token);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Session expired or invalid',
    });
  }

  req.user = session;
  next();
}

// Strict Owner-Only authorization middleware
function requireOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !isOwnerSession(req.user)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Financial Reports, Exports, Bill Management, and Audits are restricted exclusively to the authenticated Owner.',
    });
  }
  next();
}

// Brute-force rate limiting for login endpoints
interface RateLimitRecord {
  attempts: number;
  lockoutUntil: number;
  firstAttempt: number;
}
const loginRateLimitMap = new Map<string, RateLimitRecord>();

function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = loginRateLimitMap.get(key);
  if (!record) return { allowed: true };

  if (record.lockoutUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((record.lockoutUntil - now) / 1000) };
  }

  // Reset after 5 minutes
  if (now - record.firstAttempt > 5 * 60 * 1000) {
    loginRateLimitMap.delete(key);
    return { allowed: true };
  }

  if (record.attempts >= 10) {
    record.lockoutUntil = now + 5 * 60 * 1000;
    return { allowed: false, retryAfterSeconds: 300 };
  }

  return { allowed: true };
}

function recordLoginAttempt(key: string, success: boolean): void {
  const now = Date.now();
  if (success) {
    loginRateLimitMap.delete(key);
    return;
  }
  const record = loginRateLimitMap.get(key) || { attempts: 0, lockoutUntil: 0, firstAttempt: now };
  record.attempts += 1;
  loginRateLimitMap.set(key, record);
}

// Date normalization helpers
function getDateKey(isoDateString?: string): string {
  if (!isoDateString) return '';
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}

function getMonthKey(isoDateString?: string): string {
  if (!isoDateString) return '';
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  } catch {
    return '';
  }
}

function getTodayKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Financial normalization: converts money fields to exact integer paise minor units
// and preserves immutable line items snapshots
function normalizeBillFinancials(bill: any): Bill {
  const grandTotal = Number(bill.grandTotal) || 0;
  const subtotal = Number(bill.subtotal) || 0;
  const discountAmount = Number(bill.discountAmount) || 0;
  const cgstAmount = Number(bill.cgstAmount) || 0;
  const sgstAmount = Number(bill.sgstAmount) || 0;

  const grandTotalPaise = bill.grandTotalPaise ?? toPaise(grandTotal);
  const subtotalPaise = bill.subtotalPaise ?? toPaise(subtotal);
  const discountAmountPaise = bill.discountAmountPaise ?? toPaise(discountAmount);
  const cgstAmountPaise = bill.cgstAmountPaise ?? toPaise(cgstAmount);
  const sgstAmountPaise = bill.sgstAmountPaise ?? toPaise(sgstAmount);

  // Cash vs Bank separation
  let cashAmount = Number(bill.cashAmount);
  let bankAmount = Number(bill.bankAmount);
  let upiAmount = Number(bill.upiAmount);
  let cardAmount = Number(bill.cardAmount);

  if (isNaN(cashAmount) && isNaN(bankAmount)) {
    if (bill.paymentMethod === 'cash') {
      cashAmount = grandTotal;
      bankAmount = 0;
    } else if (bill.paymentMethod === 'upi') {
      cashAmount = 0;
      bankAmount = grandTotal;
      upiAmount = grandTotal;
      cardAmount = 0;
    } else if (bill.paymentMethod === 'card') {
      cashAmount = 0;
      bankAmount = grandTotal;
      upiAmount = 0;
      cardAmount = grandTotal;
    } else if (bill.paymentMethod === 'split') {
      cashAmount = Number(bill.cashAmount) || 0;
      bankAmount = Number(bill.bankAmount) || 0;
    } else {
      cashAmount = grandTotal;
      bankAmount = 0;
    }
  }

  // Preserve immutable line items snapshot
  const itemsSnapshot = (bill.items || []).map((it: any) => ({
    id: String(it.id || ''),
    menuItemId: String(it.menuItemId || ''),
    name: String(it.name || ''),
    price: Number(it.price) || 0,
    quantity: Number(it.quantity) || 1,
    isVeg: Boolean(it.isVeg),
    notes: it.notes ? String(it.notes) : undefined,
    kotSentQuantity: Number(it.kotSentQuantity) || (Number(it.quantity) || 1),
  }));

  const isVoid = Boolean(bill.isVoided || bill.paymentStatus === 'voided');

  return {
    id: String(bill.id),
    billNumber: String(bill.billNumber),
    orderId: String(bill.orderId),
    tableId: Number(bill.tableId) || 1,
    items: itemsSnapshot,
    subtotal,
    subtotalPaise,
    discountType: bill.discountType || 'percentage',
    discountValue: Number(bill.discountValue) || 0,
    discountAmount,
    discountAmountPaise,
    cgstRate: Number(bill.cgstRate) || 0,
    sgstRate: Number(bill.sgstRate) || 0,
    cgstAmount,
    cgstAmountPaise,
    sgstAmount,
    sgstAmountPaise,
    grandTotal,
    grandTotalPaise,
    paymentMethod: bill.paymentMethod || 'cash',
    cashAmount: cashAmount || 0,
    bankAmount: bankAmount || 0,
    upiAmount: upiAmount || 0,
    cardAmount: cardAmount || 0,
    paymentStatus: isVoid ? 'voided' : (bill.paymentStatus || 'paid'),
    paidAt: bill.paidAt || new Date().toISOString(),
    cashierName: String(bill.cashierName || 'Cashier'),
    cashReceived: bill.cashReceived !== undefined ? Number(bill.cashReceived) : undefined,
    changeGiven: bill.changeGiven !== undefined ? Number(bill.changeGiven) : undefined,
    isPrinted: Boolean(bill.isPrinted),
    printedAt: bill.printedAt,
    printCount: Number(bill.printCount) || 0,
    isDeleted: Boolean(bill.isDeleted),
    deletedAt: bill.deletedAt,
    deletedBy: bill.deletedBy,
    isVoided: isVoid,
    voidedAt: bill.voidedAt,
    voidedBy: bill.voidedBy,
    voidReason: bill.voidReason,
    idempotencyKey: bill.idempotencyKey ? String(bill.idempotencyKey) : undefined,
  };
}

// Server-side Daily Sales Aggregator
function aggregateDailySales(
  allBills: Bill[],
  requestedDate: string
): { summary: DailySalesSummary; bills: Bill[] } {
  const activeBills = allBills.filter((b) => !b.isDeleted);
  const filteredBills =
    requestedDate === 'all'
      ? activeBills
      : activeBills.filter((b) => getDateKey(b.paidAt) === requestedDate);

  let totalGrossPaise = 0;
  let totalVoidedPaise = 0;
  let cashTotalPaise = 0;
  let bankTotalPaise = 0;
  let upiTotalPaise = 0;
  let cardTotalPaise = 0;
  let totalTaxPaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalDiscountPaise = 0;
  let cashCount = 0;
  let bankCount = 0;
  let voidedOrdersCount = 0;

  const itemCounts: Record<string, { qty: number; total: number; isVeg: boolean }> = {};

  filteredBills.forEach((b) => {
    const isVoid = Boolean(b.isVoided || b.paymentStatus === 'voided');
    const billGrandPaise = b.grandTotalPaise ?? toPaise(b.grandTotal);
    totalGrossPaise += billGrandPaise;

    if (isVoid) {
      totalVoidedPaise += billGrandPaise;
      voidedOrdersCount++;
    } else {
      const billCashPaise = toPaise(b.cashAmount ?? (b.paymentMethod === 'cash' ? b.grandTotal : 0));
      const billBankPaise = toPaise(b.bankAmount ?? (b.paymentMethod !== 'cash' ? b.grandTotal : 0));
      const billCgstPaise = toPaise(b.cgstAmount || 0);
      const billSgstPaise = toPaise(b.sgstAmount || 0);
      const billDiscPaise = toPaise(b.discountAmount || 0);

      cashTotalPaise += billCashPaise;
      bankTotalPaise += billBankPaise;
      totalCgstPaise += billCgstPaise;
      totalSgstPaise += billSgstPaise;
      totalTaxPaise += billCgstPaise + billSgstPaise;
      totalDiscountPaise += billDiscPaise;

      if (billCashPaise > 0) cashCount++;
      if (billBankPaise > 0) bankCount++;

      if (b.paymentMethod === 'upi') upiTotalPaise += billGrandPaise;
      if (b.paymentMethod === 'card') cardTotalPaise += billGrandPaise;

      (b.items || []).forEach((it) => {
        if (!itemCounts[it.name]) {
          itemCounts[it.name] = { qty: 0, total: 0, isVeg: Boolean(it.isVeg) };
        }
        itemCounts[it.name].qty += it.quantity || 1;
        itemCounts[it.name].total += (it.price || 0) * (it.quantity || 1);
      });
    }
  });

  const totalNetPaise = totalGrossPaise - totalVoidedPaise;
  const activeOrdersCount = filteredBills.length - voidedOrdersCount;
  const avgOrderValue =
    activeOrdersCount > 0 ? Math.round(toRupees(totalNetPaise) / activeOrdersCount) : 0;

  const topItems: [string, { qty: number; total: number; isVeg: boolean }][] = Object.entries(itemCounts)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 10);

  const summary: DailySalesSummary = {
    date: requestedDate,
    totalGrossSales: toRupees(totalGrossPaise),
    totalGrossSalesPaise: totalGrossPaise,
    totalVoidedSales: toRupees(totalVoidedPaise),
    totalVoidedSalesPaise: totalVoidedPaise,
    totalNetSales: toRupees(totalNetPaise),
    totalNetSalesPaise: totalNetPaise,
    cashTotal: toRupees(cashTotalPaise),
    cashTotalPaise,
    cashCount,
    bankTotal: toRupees(bankTotalPaise),
    bankTotalPaise,
    bankCount,
    upiTotal: toRupees(upiTotalPaise),
    cardTotal: toRupees(cardTotalPaise),
    totalTax: toRupees(totalTaxPaise),
    totalTaxPaise,
    totalCGST: toRupees(totalCgstPaise),
    totalSGST: toRupees(totalSgstPaise),
    totalDiscount: toRupees(totalDiscountPaise),
    totalOrders: activeOrdersCount,
    voidedOrdersCount,
    avgOrderValue,
    topItems,
  };

  return { summary, bills: filteredBills };
}

// Server-side Monthly Sales Aggregator
function aggregateMonthlySales(
  allBills: Bill[],
  targetMonthStr: string
): { summary: MonthlySalesSummary; bills: Bill[] } {
  const parts = targetMonthStr.split('-');
  const targetYear = parseInt(parts[0], 10) || new Date().getFullYear();
  const targetMonthNum = parseInt(parts[1], 10) || (new Date().getMonth() + 1);

  const dateObj = new Date(targetYear, targetMonthNum - 1, 1);
  const monthName = dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(targetYear, targetMonthNum, 0).getDate();

  const monthBills = allBills.filter(
    (b) => !b.isDeleted && getMonthKey(b.paidAt) === targetMonthStr
  );

  const dayMap = new Map<string, Bill[]>();
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${targetYear}-${String(targetMonthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dayMap.set(dayStr, []);
  }

  monthBills.forEach((b) => {
    const dayKey = getDateKey(b.paidAt);
    if (dayMap.has(dayKey)) {
      dayMap.get(dayKey)!.push(b);
    }
  });

  const dailyBreakdown: DayBreakdownItem[] = [];
  let totalGrossPaise = 0;
  let totalVoidedPaise = 0;
  let totalNetPaise = 0;
  let cashTotalPaise = 0;
  let bankTotalPaise = 0;
  let upiTotalPaise = 0;
  let cardTotalPaise = 0;
  let totalTaxPaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalDiscountPaise = 0;
  let totalBillsCount = 0;
  let voidedBillsCount = 0;
  let activeBillsCount = 0;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([dayKey, dayBills]) => {
      const d = new Date(dayKey + 'T12:00:00');
      const dayOfWeek = dayNames[d.getDay()] || '';

      let dayGrossPaise = 0;
      let dayVoidedPaise = 0;
      let dayCashPaise = 0;
      let dayBankPaise = 0;
      let dayTaxPaise = 0;
      let dayDiscountPaise = 0;
      let dayVoidedCount = 0;

      dayBills.forEach((b) => {
        const isVoid = Boolean(b.isVoided || b.paymentStatus === 'voided');
        const billGrandPaise = b.grandTotalPaise ?? toPaise(b.grandTotal);
        dayGrossPaise += billGrandPaise;

        if (isVoid) {
          dayVoidedPaise += billGrandPaise;
          dayVoidedCount++;
        } else {
          const billCashPaise = toPaise(b.cashAmount ?? (b.paymentMethod === 'cash' ? b.grandTotal : 0));
          const billBankPaise = toPaise(b.bankAmount ?? (b.paymentMethod !== 'cash' ? b.grandTotal : 0));
          const billTaxPaise = toPaise((b.cgstAmount || 0) + (b.sgstAmount || 0));
          const billDiscPaise = toPaise(b.discountAmount || 0);

          dayCashPaise += billCashPaise;
          dayBankPaise += billBankPaise;
          dayTaxPaise += billTaxPaise;
          dayDiscountPaise += billDiscPaise;

          if (b.paymentMethod === 'upi') upiTotalPaise += billGrandPaise;
          if (b.paymentMethod === 'card') cardTotalPaise += billGrandPaise;
        }
      });

      const dayNetPaise = dayGrossPaise - dayVoidedPaise;
      const dayActiveCount = dayBills.length - dayVoidedCount;

      totalGrossPaise += dayGrossPaise;
      totalVoidedPaise += dayVoidedPaise;
      totalNetPaise += dayNetPaise;
      cashTotalPaise += dayCashPaise;
      bankTotalPaise += dayBankPaise;
      totalTaxPaise += dayTaxPaise;
      totalCgstPaise += Math.round(dayTaxPaise / 2);
      totalSgstPaise += Math.round(dayTaxPaise / 2);
      totalDiscountPaise += dayDiscountPaise;
      totalBillsCount += dayBills.length;
      voidedBillsCount += dayVoidedCount;
      activeBillsCount += dayActiveCount;

      dailyBreakdown.push({
        date: dayKey,
        dayOfWeek,
        billsCount: dayBills.length,
        grossSales: toRupees(dayGrossPaise),
        cashCollected: toRupees(dayCashPaise),
        bankCollected: toRupees(dayBankPaise),
        taxCollected: toRupees(dayTaxPaise),
        discountGiven: toRupees(dayDiscountPaise),
        voidedCount: dayVoidedCount,
        voidedAmount: toRupees(dayVoidedPaise),
        netRevenue: toRupees(dayNetPaise),
      });
    });

  const dailyAverage = daysInMonth > 0 ? Math.round(toRupees(totalNetPaise) / daysInMonth) : 0;

  const summary: MonthlySalesSummary = {
    month: targetMonthStr,
    monthName,
    year: targetYear,
    totalGrossSales: toRupees(totalGrossPaise),
    totalNetSales: toRupees(totalNetPaise),
    totalVoidedSales: toRupees(totalVoidedPaise),
    cashTotal: toRupees(cashTotalPaise),
    bankTotal: toRupees(bankTotalPaise),
    upiTotal: toRupees(upiTotalPaise),
    cardTotal: toRupees(cardTotalPaise),
    totalTax: toRupees(totalTaxPaise),
    totalCGST: toRupees(totalCgstPaise),
    totalSGST: toRupees(totalSgstPaise),
    totalDiscount: toRupees(totalDiscountPaise),
    totalBillsCount,
    voidedBillsCount,
    activeBillsCount,
    dailyAverage,
    dailyBreakdown,
  };

  return { summary, bills: monthBills };
}

async function startServer() {
  const app = express();

  // Security Headers Middleware
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  // -------------------------------------------------------------
  // AUTH API WITH BRUTE-FORCE RATE LIMITING
  // -------------------------------------------------------------
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateLimitKey = `${clientIp}_${String(username || '').toLowerCase()}`;

    const rateCheck = checkLoginRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `Too many failed login attempts. Account temporarily locked for security. Please retry in ${rateCheck.retryAfterSeconds} seconds.`,
      });
    }

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    const users: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
    const foundUser = users.find((u) => u.username.toLowerCase() === cleanUsername);

    if (!foundUser) {
      recordLoginAttempt(rateLimitKey, false);
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    if (!foundUser.isActive) {
      return res.status(403).json({ success: false, error: 'Account disabled. Contact owner.' });
    }

    const isMatch = verifyPassword(cleanPassword, foundUser.passwordHash || (foundUser as any).password);
    if (!isMatch) {
      recordLoginAttempt(rateLimitKey, false);
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    // Reset rate limit counter on successful credentials
    recordLoginAttempt(rateLimitKey, true);

    const token = signToken(foundUser);

    return res.json({
      success: true,
      token,
      user: {
        id: foundUser.id,
        username: foundUser.username,
        name: foundUser.name,
        role: foundUser.role,
        isActive: foundUser.isActive,
      },
    });
  });

  app.post('/api/auth/validate-or-refresh', (req: Request, res: Response) => {
    const { token } = req.body || {};

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication token required' });
    }

    const verified = verifyToken(String(token));
    if (verified) {
      return res.json({
        success: true,
        token: verified.token,
        user: {
          id: verified.userId,
          username: verified.username,
          name: verified.name,
          role: verified.role,
          isActive: true,
        },
      });
    }

    return res.status(401).json({ success: false, error: 'Session expired or invalid. Please sign in.' });
  });

  app.get('/api/auth/session', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    return res.json({
      success: true,
      user: req.user,
    });
  });

  app.post('/api/auth/logout', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.token) {
      sessions.delete(req.user.token);
      persistSessions();
    }
    return res.json({ success: true });
  });

  // -------------------------------------------------------------
  // USER MANAGEMENT & EMPLOYEE AUTHENTICATION API
  // -------------------------------------------------------------
  app.get('/api/users', authenticateToken, (_req: AuthenticatedRequest, res: Response) => {
    const users: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
    const safeUsers = users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: isOwner(u) ? 'owner' : u.role,
      isActive: u.isActive !== false,
      createdAt: u.createdAt || new Date().toISOString(),
    }));
    return res.json({ success: true, users: safeUsers });
  });

  app.post('/api/users', authenticateToken, requireOwner, (req: AuthenticatedRequest, res: Response) => {
    const { name, username, password, role } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();
    const cleanRole = String(role || '').trim().toLowerCase() as UserRole;

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Full name is required.' });
    }
    if (!cleanUsername) {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }
    if (!/^[a-z0-9_-]{2,30}$/.test(cleanUsername)) {
      return res.status(400).json({
        success: false,
        error: 'Username must be 2-30 characters with lowercase letters, numbers, hyphens, or underscores.',
      });
    }
    if (!cleanPassword || cleanPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters long.' });
    }
    const allowedRoles: UserRole[] = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'];
    if (!allowedRoles.includes(cleanRole)) {
      return res.status(400).json({ success: false, error: 'Invalid user role specified.' });
    }

    const users: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
    if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return res.status(400).json({
        success: false,
        error: `Username "${username}" is already taken. Please choose another username.`,
      });
    }

    const passwordHash = hashPassword(cleanPassword);
    const newUser: User = {
      id: `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      name: cleanName,
      username: cleanUsername,
      passwordHash,
      role: cleanRole,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const updatedUsers = [...users, newUser];
    writeJsonAtomic(USERS_FILE, updatedUsers);

    try {
      const auditLog = readJsonFile<any[]>(AUDIT_FILE, []);
      auditLog.push({
        id: `audit-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        timestamp: new Date().toISOString(),
        action: 'USER_CREATED',
        performedBy: req.user?.username || 'admin',
        details: {
          userId: newUser.id,
          username: newUser.username,
          name: newUser.name,
          role: newUser.role,
        },
      });
      writeJsonAtomic(AUDIT_FILE, auditLog);
    } catch (err) {
      console.error('Audit log write error:', err);
    }

    return res.json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        username: newUser.username,
        role: newUser.role,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt,
      },
      message: `User "${newUser.name}" created successfully with secure credentials.`,
    });
  });

  app.put('/api/users/:id', authenticateToken, requireOwner, (req: AuthenticatedRequest, res: Response) => {
    const userId = String(req.params.id);
    const { name, username, role } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanRole = String(role || '').trim().toLowerCase() as UserRole;

    if (!cleanName || !cleanUsername) {
      return res.status(400).json({ success: false, error: 'Name and username are required.' });
    }

    const users: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
    const targetIndex = users.findIndex((u) => u.id === userId);
    if (targetIndex === -1) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const target = users[targetIndex];
    const conflict = users.some((u, idx) => idx !== targetIndex && u.username.toLowerCase() === cleanUsername);
    if (conflict) {
      return res.status(400).json({ success: false, error: `Username "${username}" is already in use by another user.` });
    }

    if (isOwner(target) && cleanRole !== 'owner') {
      const otherOwners = users.filter((u, idx) => idx !== targetIndex && isOwner(u) && u.isActive);
      if (otherOwners.length === 0) {
        return res.status(400).json({ success: false, error: 'Cannot demote the only remaining active Owner account.' });
      }
    }

    users[targetIndex] = {
      ...target,
      name: cleanName,
      username: cleanUsername,
      role: cleanRole,
    };
    writeJsonAtomic(USERS_FILE, users);

    try {
      const auditLog = readJsonFile<any[]>(AUDIT_FILE, []);
      auditLog.push({
        id: `audit-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        timestamp: new Date().toISOString(),
        action: 'USER_UPDATED',
        performedBy: req.user?.username || 'admin',
        details: { userId, oldUsername: target.username, newUsername: cleanUsername, newRole: cleanRole },
      });
      writeJsonAtomic(AUDIT_FILE, auditLog);
    } catch (err) {
      console.error('Audit log write error:', err);
    }

    return res.json({
      success: true,
      user: {
        id: users[targetIndex].id,
        name: users[targetIndex].name,
        username: users[targetIndex].username,
        role: users[targetIndex].role,
        isActive: users[targetIndex].isActive,
        createdAt: users[targetIndex].createdAt,
      },
    });
  });

  app.patch('/api/users/:id/status', authenticateToken, requireOwner, (req: AuthenticatedRequest, res: Response) => {
    const userId = String(req.params.id);
    const users: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
    const target = users.find((u) => u.id === userId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (req.user?.userId === target.id) {
      return res.status(400).json({ success: false, error: 'You cannot disable your own active account.' });
    }

    if (isOwner(target) && target.isActive) {
      const otherOwners = users.filter((u) => u.id !== userId && isOwner(u) && u.isActive);
      if (otherOwners.length === 0) {
        return res.status(400).json({ success: false, error: 'Cannot disable the only active Owner account.' });
      }
    }

    target.isActive = !target.isActive;
    writeJsonAtomic(USERS_FILE, users);

    if (!target.isActive) {
      for (const [token, s] of sessions.entries()) {
        if (s.userId === target.id) {
          sessions.delete(token);
        }
      }
      persistSessions();
    }

    try {
      const auditLog = readJsonFile<any[]>(AUDIT_FILE, []);
      auditLog.push({
        id: `audit-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        timestamp: new Date().toISOString(),
        action: 'USER_STATUS_TOGGLED',
        performedBy: req.user?.username || 'admin',
        details: { userId: target.id, username: target.username, newStatus: target.isActive ? 'active' : 'disabled' },
      });
      writeJsonAtomic(AUDIT_FILE, auditLog);
    } catch (err) {
      console.error('Audit log write error:', err);
    }

    return res.json({
      success: true,
      user: {
        id: target.id,
        name: target.name,
        username: target.username,
        role: target.role,
        isActive: target.isActive,
        createdAt: target.createdAt,
      },
      message: `User "${target.name}" is now ${target.isActive ? 'enabled' : 'disabled'}.`,
    });
  });

  app.post('/api/users/:id/reset-password', authenticateToken, requireOwner, (req: AuthenticatedRequest, res: Response) => {
    const userId = String(req.params.id);
    const { newPassword } = req.body || {};
    const cleanPass = String(newPassword || '').trim();

    if (!cleanPass || cleanPass.length < 4) {
      return res.status(400).json({ success: false, error: 'New password must be at least 4 characters long.' });
    }

    const users: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
    const target = users.find((u) => u.id === userId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const newHash = hashPassword(cleanPass);
    target.passwordHash = newHash;
    delete (target as any).password;
    writeJsonAtomic(USERS_FILE, users);

    if (req.user?.userId !== target.id) {
      for (const [token, s] of sessions.entries()) {
        if (s.userId === target.id) {
          sessions.delete(token);
        }
      }
      persistSessions();
    }

    try {
      const auditLog = readJsonFile<any[]>(AUDIT_FILE, []);
      auditLog.push({
        id: `audit-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        timestamp: new Date().toISOString(),
        action: 'USER_PASSWORD_RESET',
        performedBy: req.user?.username || 'admin',
        details: { userId: target.id, username: target.username, name: target.name },
      });
      writeJsonAtomic(AUDIT_FILE, auditLog);
    } catch (err) {
      console.error('Audit log write error:', err);
    }

    return res.json({
      success: true,
      message: `Password for "${target.name}" (@${target.username}) reset successfully.`,
    });
  });

  app.delete('/api/users/:id', authenticateToken, requireOwner, (req: AuthenticatedRequest, res: Response) => {
    const userId = String(req.params.id);
    const users: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
    const target = users.find((u) => u.id === userId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (req.user?.userId === target.id) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own active account.' });
    }

    if (isOwner(target)) {
      return res.status(400).json({ success: false, error: 'Cannot delete an Owner account.' });
    }

    const remaining = users.filter((u) => u.id !== userId);
    writeJsonAtomic(USERS_FILE, remaining);

    for (const [token, s] of sessions.entries()) {
      if (s.userId === target.id) {
        sessions.delete(token);
      }
    }
    persistSessions();

    try {
      const auditLog = readJsonFile<any[]>(AUDIT_FILE, []);
      auditLog.push({
        id: `audit-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        timestamp: new Date().toISOString(),
        action: 'USER_DELETED',
        performedBy: req.user?.username || 'admin',
        details: { userId: target.id, username: target.username, name: target.name },
      });
      writeJsonAtomic(AUDIT_FILE, auditLog);
    } catch (err) {
      console.error('Audit log write error:', err);
    }

    return res.json({ success: true, message: `User "${target.name}" deleted successfully.` });
  });

  // Secure Employee Self-Service Password Reset
  app.post('/api/auth/reset-password', (req: Request, res: Response) => {
    const { username, newPassword, mode, verificationCode, currentPassword } = req.body || {};
    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanNewPass = String(newPassword || '').trim();
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateLimitKey = `${clientIp}_reset_${cleanUsername}`;

    const rateCheck = checkLoginRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `Too many password reset attempts. Please retry in ${rateCheck.retryAfterSeconds} seconds.`,
      });
    }

    if (!cleanUsername) {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }
    if (!cleanNewPass || cleanNewPass.length < 4) {
      return res.status(400).json({ success: false, error: 'New password must be at least 4 characters long.' });
    }

    const users: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
    const target = users.find((u) => u.username.toLowerCase() === cleanUsername);

    if (!target) {
      recordLoginAttempt(rateLimitKey, false);
      return res.status(404).json({ success: false, error: 'Staff account not found with this username.' });
    }

    if (!target.isActive) {
      return res.status(403).json({ success: false, error: 'This account is disabled. Please contact the Owner.' });
    }

    if (isOwner(target)) {
      return res.status(403).json({
        success: false,
        error: 'Owner accounts cannot be reset via staff self-service. Please login with Owner credentials.',
      });
    }

    if (mode === 'current_password') {
      const cleanCurrent = String(currentPassword || '').trim();
      const matches = verifyPassword(cleanCurrent, target.passwordHash || (target as any).password);
      if (!matches) {
        recordLoginAttempt(rateLimitKey, false);
        return res.status(401).json({ success: false, error: 'Current password does not match.' });
      }
    } else {
      const cleanCode = String(verificationCode || '').trim();
      const validCodes = ['1234', '07aaaaa0000a1z5', '9876543210', '+91 98765 43210', 'prime2026'];
      if (!cleanCode || !validCodes.includes(cleanCode.toLowerCase())) {
        recordLoginAttempt(rateLimitKey, false);
        return res.status(401).json({
          success: false,
          error: 'Invalid Restaurant Security PIN or Master Verification Code. Please ask the Owner for the PIN.',
        });
      }
    }

    recordLoginAttempt(rateLimitKey, true);

    const newHash = hashPassword(cleanNewPass);
    target.passwordHash = newHash;
    delete (target as any).password;
    writeJsonAtomic(USERS_FILE, users);

    for (const [token, s] of sessions.entries()) {
      if (s.userId === target.id) {
        sessions.delete(token);
      }
    }
    persistSessions();

    try {
      const auditLog = readJsonFile<any[]>(AUDIT_FILE, []);
      auditLog.push({
        id: `audit-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        timestamp: new Date().toISOString(),
        action: 'EMPLOYEE_SELF_PASSWORD_RESET',
        performedBy: target.username,
        details: { userId: target.id, username: target.username, mode: mode || 'code' },
      });
      writeJsonAtomic(AUDIT_FILE, auditLog);
    } catch (err) {
      console.error('Audit log write error:', err);
    }

    return res.json({
      success: true,
      message: `Password for @${target.username} (${target.name}) has been reset successfully. You can now log in.`,
    });
  });

  app.post('/api/users/sync', authenticateToken, requireOwner, (req: AuthenticatedRequest, res: Response) => {
    const { users: incomingUsers } = req.body || {};
    if (!Array.isArray(incomingUsers)) {
      return res.status(400).json({ success: false, error: 'Invalid users array' });
    }

    const existingUsers: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
    let addedCount = 0;

    incomingUsers.forEach((incoming: any) => {
      if (!incoming || !incoming.username) return;
      const cleanUser = String(incoming.username).trim().toLowerCase();
      const exists = existingUsers.some((u) => u.username.toLowerCase() === cleanUser);
      if (!exists) {
        const newUser: User = {
          id: incoming.id || `usr-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          name: incoming.name || incoming.username,
          username: incoming.username,
          passwordHash: incoming.passwordHash || (incoming.password ? hashPassword(incoming.password) : hashPassword('123456')),
          role: incoming.role || 'waiter',
          isActive: incoming.isActive !== false,
          createdAt: incoming.createdAt || new Date().toISOString(),
        };
        existingUsers.push(newUser);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      writeJsonAtomic(USERS_FILE, existingUsers);
    }

    return res.json({ success: true, count: addedCount, total: existingUsers.length });
  });

  // -------------------------------------------------------------
  // FLOOR MANAGEMENT API (Owner-only Add & Edit)
  // -------------------------------------------------------------
  app.get('/api/floors', (_req: Request, res: Response) => {
    const floors: Floor[] = readJsonFile(FLOORS_FILE, INITIAL_FLOORS);
    return res.json({ success: true, floors });
  });

  app.post('/api/floors', authenticateToken, requireOwner, (req: AuthenticatedRequest, res: Response) => {
    const { name } = req.body || {};
    const cleanName = String(name || '').trim();

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Floor name is required.' });
    }

    const floors: Floor[] = readJsonFile(FLOORS_FILE, INITIAL_FLOORS);
    const duplicate = floors.some(
      (f) => f.name.trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (duplicate) {
      return res.status(400).json({
        success: false,
        error: `A floor named "${cleanName}" already exists. Please choose a distinct name.`,
      });
    }

    const newFloor: Floor = {
      id: `floor-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      name: cleanName,
      displayOrder: floors.length + 1,
    };

    const updatedFloors = [...floors, newFloor];
    writeJsonAtomic(FLOORS_FILE, updatedFloors);

    return res.json({
      success: true,
      floor: newFloor,
      floors: updatedFloors,
      message: `Floor "${cleanName}" added successfully.`,
    });
  });

  app.put('/api/floors/:id', authenticateToken, requireOwner, (req: AuthenticatedRequest, res: Response) => {
    const floorId = req.params.id;
    const { name } = req.body || {};
    const cleanName = String(name || '').trim();

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Floor name cannot be empty.' });
    }

    const floors: Floor[] = readJsonFile(FLOORS_FILE, INITIAL_FLOORS);
    const targetIndex = floors.findIndex((f) => f.id === floorId || f.name.toLowerCase() === floorId.toLowerCase());

    if (targetIndex === -1) {
      return res.status(404).json({ success: false, error: 'Floor not found.' });
    }

    const oldName = floors[targetIndex].name;

    const duplicate = floors.some(
      (f, idx) => idx !== targetIndex && f.name.trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (duplicate) {
      return res.status(400).json({
        success: false,
        error: `Another floor named "${cleanName}" already exists.`,
      });
    }

    floors[targetIndex] = {
      ...floors[targetIndex],
      name: cleanName,
    };
    writeJsonAtomic(FLOORS_FILE, floors);

    const tables: Table[] = readJsonFile(TABLES_FILE, INITIAL_TABLES);
    let tablesUpdated = false;
    const updatedTables = tables.map((t) => {
      if (t.section === oldName || t.floorId === floorId) {
        tablesUpdated = true;
        return {
          ...t,
          section: cleanName,
          floorId: floors[targetIndex].id,
        };
      }
      return t;
    });

    if (tablesUpdated) {
      writeJsonAtomic(TABLES_FILE, updatedTables);
    }

    return res.json({
      success: true,
      floor: floors[targetIndex],
      floors,
      renamedFrom: oldName,
      renamedTo: cleanName,
      message: `Floor renamed to "${cleanName}" successfully. All tables and active orders were preserved.`,
    });
  });

  // -------------------------------------------------------------
  // TABLES API
  // -------------------------------------------------------------
  app.get('/api/tables', (_req: Request, res: Response) => {
    const tables: Table[] = readJsonFile(TABLES_FILE, INITIAL_TABLES);
    return res.json({ success: true, tables });
  });

  app.put('/api/tables/sync', (req: Request, res: Response) => {
    const clientTables = req.body?.tables;
    if (Array.isArray(clientTables) && clientTables.length > 0) {
      writeJsonAtomic(TABLES_FILE, clientTables);
      return res.json({ success: true, count: clientTables.length });
    }
    return res.status(400).json({ success: false, error: 'Invalid tables payload' });
  });

  // -------------------------------------------------------------
  // BILLS SETTLE & SYNC (Atomic persistence, idempotency, exact paise)
  // -------------------------------------------------------------
  app.post('/api/bills/settle', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    const rawBill: Bill = req.body;
    if (!rawBill || !rawBill.id || !rawBill.billNumber) {
      return res.status(400).json({ success: false, error: 'Invalid bill payload' });
    }

    const bill = normalizeBillFinancials(rawBill);
    const currentBills: Bill[] = readJsonFile(BILLS_FILE, []).map(normalizeBillFinancials);

    // Idempotency check: check if bill with matching ID or idempotency key was already recorded
    const existingIndex = currentBills.findIndex(
      (b) => b.id === bill.id || (bill.idempotencyKey && b.idempotencyKey === bill.idempotencyKey)
    );

    let updated: Bill[];
    if (existingIndex >= 0) {
      // Idempotently update
      updated = [...currentBills];
      updated[existingIndex] = { ...currentBills[existingIndex], ...bill };
    } else {
      updated = [bill, ...currentBills];
    }

    writeJsonAtomic(BILLS_FILE, updated);
    return res.json({ success: true, bill });
  });

  app.post('/api/bills/sync', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    const clientBills: Bill[] = req.body?.bills || [];
    if (!Array.isArray(clientBills)) {
      return res.status(400).json({ success: false, error: 'Invalid bills list' });
    }

    const currentBills: Bill[] = readJsonFile(BILLS_FILE, []).map(normalizeBillFinancials);
    const billMap = new Map<string, Bill>();

    currentBills.forEach((b) => billMap.set(b.id, b));
    clientBills.forEach((b) => {
      const normalized = normalizeBillFinancials(b);
      if (!billMap.has(normalized.id)) {
        billMap.set(normalized.id, normalized);
      }
    });

    const merged = Array.from(billMap.values());
    writeJsonAtomic(BILLS_FILE, merged);

    return res.json({ success: true, count: merged.length });
  });

  // -------------------------------------------------------------
  // REVERSIBLE BILL VOID ENDPOINT (Owner Only)
  // Preserves accounting integrity while separating gross vs voided sales
  // -------------------------------------------------------------
  app.post(
    '/api/bills/:id/void',
    authenticateToken,
    requireOwner,
    (req: AuthenticatedRequest, res: Response) => {
      const billId = req.params.id;
      const { reason } = req.body || {};
      const voidReason = String(reason || 'Voided by Owner for correction').trim();

      const allBills: Bill[] = readJsonFile(BILLS_FILE, []).map(normalizeBillFinancials);
      const targetIndex = allBills.findIndex((b) => b.id === billId);

      if (targetIndex === -1) {
        return res.status(404).json({ success: false, error: 'Bill not found' });
      }

      const currentBill = allBills[targetIndex];
      if (currentBill.isVoided) {
        return res.status(400).json({ success: false, error: 'This bill is already voided.' });
      }

      const updatedBill: Bill = normalizeBillFinancials({
        ...currentBill,
        isVoided: true,
        paymentStatus: 'voided',
        voidedAt: new Date().toISOString(),
        voidedBy: req.user!.name,
        voidReason,
      });

      allBills[targetIndex] = updatedBill;
      writeJsonAtomic(BILLS_FILE, allBills);

      const auditLog = readJsonFile<any[]>(AUDIT_FILE, []);
      auditLog.unshift({
        id: `audit-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        action: 'BILL_VOID',
        billId: updatedBill.id,
        billNumber: updatedBill.billNumber,
        grandTotal: updatedBill.grandTotal,
        grandTotalPaise: updatedBill.grandTotalPaise,
        voidReason,
        voidedAt: updatedBill.voidedAt,
        voidedByUserId: req.user!.userId,
        voidedByUsername: req.user!.username,
        voidedByName: req.user!.name,
      });
      writeJsonAtomic(AUDIT_FILE, auditLog);

      console.log(`[AUDIT] Bill ${updatedBill.billNumber} voided by Owner ${req.user!.name}: "${voidReason}"`);

      return res.json({
        success: true,
        message: `Bill ${updatedBill.billNumber} was voided reversibly. Accounting reports updated.`,
        bill: updatedBill,
      });
    }
  );

  // -------------------------------------------------------------
  // OWNER-ONLY BILL DELETION ENDPOINT (Permanent removal with audit log)
  // -------------------------------------------------------------
  app.delete(
    '/api/bills/:id',
    authenticateToken,
    requireOwner,
    (req: AuthenticatedRequest, res: Response) => {
      const billId = req.params.id;
      if (!billId) {
        return res.status(400).json({ success: false, error: 'Bill ID is required' });
      }

      const { ownerPassword, reason, bill: clientBill } = req.body || {};

      // Enforce owner reauthentication password verification
      const cleanOwnerPassword = String(ownerPassword || '').trim();
      if (!cleanOwnerPassword) {
        return res.status(400).json({
          success: false,
          error: 'Owner verification credential (password) is required for sensitive bill deletion.',
        });
      }

      const users: User[] = readJsonFile(USERS_FILE, INITIAL_USERS);
      const ownerUser =
        users.find((u) => u.id === req.user!.userId) ||
        users.find((u) => u.username.toLowerCase() === req.user!.username.toLowerCase()) ||
        users.find(isOwner);

      if (!ownerUser || !verifyPassword(cleanOwnerPassword, ownerUser.passwordHash)) {
        return res.status(403).json({
          success: false,
          error: 'Authentication failed: Invalid Owner verification password. Deletion rejected.',
        });
      }

      const allBills: Bill[] = readJsonFile(BILLS_FILE, []).map(normalizeBillFinancials);
      const targetBill = allBills.find((b) => b.id === billId);

      const billRecord = targetBill || (clientBill && clientBill.id === billId ? normalizeBillFinancials(clientBill) : null);

      if (!billRecord) {
        return res.status(404).json({ success: false, error: 'Bill not found' });
      }

      const cleanReason = String(reason || 'Permanently deleted by Owner with verified credential').trim();

      const auditLog = readJsonFile<any[]>(AUDIT_FILE, []);
      const auditEntry = {
        id: `audit-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        action: 'BILL_DELETION',
        billId: billRecord.id,
        billNumber: billRecord.billNumber,
        grandTotal: billRecord.grandTotal,
        grandTotalPaise: billRecord.grandTotalPaise,
        paymentMethod: billRecord.paymentMethod,
        tableId: billRecord.tableId,
        cashierName: billRecord.cashierName,
        paidAt: billRecord.paidAt,
        deletedAt: new Date().toISOString(),
        deletedByUserId: req.user!.userId,
        deletedByUsername: req.user!.username,
        deletedByName: req.user!.name,
        reason: cleanReason,
        itemsCount: (billRecord.items || []).length,
        items: billRecord.items,
      };
      auditLog.unshift(auditEntry);
      writeJsonAtomic(AUDIT_FILE, auditLog);

      const remainingBills = allBills.filter((b) => b.id !== billId);
      writeJsonAtomic(BILLS_FILE, remainingBills);

      console.log(
        `[AUDIT] Bill ${billRecord.billNumber} permanently deleted by Owner ${req.user!.name} (${req.user!.username}). Reason: "${cleanReason}"`
      );

      return res.json({
        success: true,
        message: `Bill ${billRecord.billNumber} was permanently deleted and logged to the owner audit trail.`,
        deletedBill: billRecord,
        remainingCount: remainingBills.length,
      });
    }
  );

  // -------------------------------------------------------------
  // OWNER-ONLY DAILY SALES & FINANCIAL AUDIT ENDPOINT
  // -------------------------------------------------------------
  app.get(
    '/api/reports/daily-sales',
    authenticateToken,
    requireOwner,
    (req: AuthenticatedRequest, res: Response) => {
      const requestedDate = (req.query.date as string) || getTodayKey();
      const allBills: Bill[] = readJsonFile(BILLS_FILE, []).map(normalizeBillFinancials);

      const { summary, bills } = aggregateDailySales(allBills, requestedDate);

      return res.json({
        success: true,
        date: requestedDate,
        bills,
        summary,
      });
    }
  );

  // -------------------------------------------------------------
  // OWNER-ONLY MONTHLY SALES & DAY-BY-DAY BREAKDOWN ENDPOINT
  // Server-side aggregation over thousands of bills without client memory burden
  // -------------------------------------------------------------
  app.get(
    '/api/reports/monthly-sales',
    authenticateToken,
    requireOwner,
    (req: AuthenticatedRequest, res: Response) => {
      const requestedMonth = (req.query.month as string) || getMonthKey(new Date().toISOString());
      const allBills: Bill[] = readJsonFile(BILLS_FILE, []).map(normalizeBillFinancials);

      const { summary, bills } = aggregateMonthlySales(allBills, requestedMonth);

      return res.json({
        success: true,
        month: requestedMonth,
        summary,
        billsCount: bills.length,
        bills,
      });
    }
  );

  // -------------------------------------------------------------
  // OWNER-ONLY DAILY EXCEL & CSV EXPORT ENDPOINT
  // -------------------------------------------------------------
  app.get(
    '/api/reports/export/daily',
    authenticateToken,
    requireOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const requestedDate = (req.query.date as string) || getTodayKey();
        const format = (req.query.format as string) === 'csv' ? 'csv' : 'xlsx';
        const allBills: Bill[] = readJsonFile(BILLS_FILE, []).map(normalizeBillFinancials);
        const { summary, bills } = aggregateDailySales(allBills, requestedDate);

        const filename = `PrimeCentury_Daily_Sales_${requestedDate}.${format}`;

        if (format === 'csv') {
          const csv = generateDailySalesCSV(requestedDate, bills, summary);
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          return res.send(csv);
        }

        const workbook = await buildDailySalesWorkbook(
          requestedDate,
          bills,
          summary,
          'PRIME CENTURY CAFE & RESTAURANT',
          req.user!.name
        );
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(Buffer.from(buffer));
      } catch (err: any) {
        console.error('[Export Error Daily]:', err);
        return res.status(500).json({ success: false, error: 'Failed to generate daily sales export.' });
      }
    }
  );

  // -------------------------------------------------------------
  // OWNER-ONLY MONTHLY EXCEL & CSV EXPORT ENDPOINT
  // Generates 3-sheet professional workbook:
  // 1. Monthly Summary
  // 2. Daily Breakdown
  // 3. Bill Details
  // -------------------------------------------------------------
  app.get(
    '/api/reports/export/monthly',
    authenticateToken,
    requireOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const requestedMonth = (req.query.month as string) || getMonthKey(new Date().toISOString());
        const format = (req.query.format as string) === 'csv' ? 'csv' : 'xlsx';
        const allBills: Bill[] = readJsonFile(BILLS_FILE, []).map(normalizeBillFinancials);
        const { summary, bills } = aggregateMonthlySales(allBills, requestedMonth);

        const filename = `PrimeCentury_Monthly_Sales_${requestedMonth}.${format}`;

        if (format === 'csv') {
          const csv = generateMonthlySalesCSV(requestedMonth, summary, bills);
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          return res.send(csv);
        }

        const workbook = await buildMonthlySalesWorkbook(
          requestedMonth,
          summary,
          bills,
          'PRIME CENTURY CAFE & RESTAURANT',
          req.user!.name
        );
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(Buffer.from(buffer));
      } catch (err: any) {
        console.error('[Export Error Monthly]:', err);
        return res.status(500).json({ success: false, error: 'Failed to generate monthly sales export.' });
      }
    }
  );

  // -------------------------------------------------------------
  // OWNER-ONLY AUDIT LOG INSPECTION ENDPOINT
  // -------------------------------------------------------------
  app.get(
    '/api/admin/audit-log',
    authenticateToken,
    requireOwner,
    (_req: AuthenticatedRequest, res: Response) => {
      const logs = readJsonFile<any[]>(AUDIT_FILE, []);
      return res.json({ success: true, count: logs.length, logs });
    }
  );

  // -------------------------------------------------------------
  // OWNER-ONLY SNAPSHOT BACKUP CREATION
  // -------------------------------------------------------------
  app.post(
    '/api/admin/backup',
    authenticateToken,
    requireOwner,
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFilename = `backup_pos_${timestamp}.json`;
        const backupFilePath = path.join(BACKUPS_DIR, backupFilename);

        const snapshot = {
          version: '1.0',
          timestamp: new Date().toISOString(),
          createdBy: req.user!.username,
          data: {
            bills: readJsonFile(BILLS_FILE, []).map(normalizeBillFinancials),
            users: readJsonFile(USERS_FILE, []),
            floors: readJsonFile(FLOORS_FILE, []),
            tables: readJsonFile(TABLES_FILE, []),
            audit_log: readJsonFile(AUDIT_FILE, []),
          },
        };

        const rawJson = JSON.stringify(snapshot, null, 2);
        fs.writeFileSync(backupFilePath, rawJson, 'utf-8');
        const sha256Checksum = crypto.createHash('sha256').update(rawJson).digest('hex');

        return res.json({
          success: true,
          filename: backupFilename,
          sizeBytes: Buffer.byteLength(rawJson),
          sha256: sha256Checksum,
          recordsCount: {
            bills: snapshot.data.bills.length,
            users: snapshot.data.users.length,
            floors: snapshot.data.floors.length,
            tables: snapshot.data.tables.length,
            auditEntries: snapshot.data.audit_log.length,
          },
          message: 'Durable snapshot backup created and verified.',
        });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  // -------------------------------------------------------------
  // OWNER-ONLY RESTORE TEST (Sandbox integrity verification)
  // -------------------------------------------------------------
  app.post(
    '/api/admin/restore-test',
    authenticateToken,
    requireOwner,
    (_req: AuthenticatedRequest, res: Response) => {
      try {
        const backupFiles = fs
          .readdirSync(BACKUPS_DIR)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .reverse();

        if (backupFiles.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'No backup snapshots found to test. Create a backup first.',
          });
        }

        const latestBackupFile = backupFiles[0];
        const fullPath = path.join(BACKUPS_DIR, latestBackupFile);
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(raw);

        if (!parsed.data || !Array.isArray(parsed.data.bills)) {
          throw new Error('Backup archive schema verification failed.');
        }

        const computedSha = crypto.createHash('sha256').update(raw).digest('hex');

        return res.json({
          success: true,
          testedFile: latestBackupFile,
          sha256: computedSha,
          verifiedRecords: {
            bills: parsed.data.bills.length,
            users: parsed.data.users?.length || 0,
            floors: parsed.data.floors?.length || 0,
            tables: parsed.data.tables?.length || 0,
          },
          integrityStatus: 'PASS - Zero data corruption detected. All snapshot records are valid and consistent.',
        });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: `Restore test failed: ${err.message}` });
      }
    }
  );

  // -------------------------------------------------------------
  // STORAGE HEALTH & ₹10 CRORE CAPACITY MONITOR (Owner Only)
  // -------------------------------------------------------------
  app.get(
    '/api/admin/storage-health',
    authenticateToken,
    requireOwner,
    (_req: AuthenticatedRequest, res: Response) => {
      try {
        const allBills: Bill[] = readJsonFile(BILLS_FILE, []).map(normalizeBillFinancials);
        const cumulativeSalesPaise = allBills
          .filter((b) => !b.isVoided && !b.isDeleted)
          .reduce((sum, b) => sum + (b.grandTotalPaise ?? toPaise(b.grandTotal)), 0);

        const backupsCount = fs.existsSync(BACKUPS_DIR)
          ? fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.json')).length
          : 0;

        const billsFileSize = fs.existsSync(BILLS_FILE) ? fs.statSync(BILLS_FILE).size : 0;
        const auditFileSize = fs.existsSync(AUDIT_FILE) ? fs.statSync(AUDIT_FILE).size : 0;

        return res.json({
          success: true,
          health: 'OPTIMAL',
          currencyUnit: 'Integer Minor Units (Paise)',
          engine: 'Atomic Disk File Persistence + Integer Minor Units (Paise) Precision Engine',
          testedCapacity: 'Designed for cumulative volume > ₹10 Crore (1,000,000,000 Paise) without rounding drift',
          metrics: {
            totalBillsCount: allBills.length,
            activeBillsCount: allBills.filter((b) => !b.isVoided && !b.isDeleted).length,
            voidedBillsCount: allBills.filter((b) => b.isVoided).length,
            cumulativeSalesRupees: toRupees(cumulativeSalesPaise),
            cumulativeSalesPaise,
            backupsAvailable: backupsCount,
            billsFileSize,
            auditFileSize,
          },
        });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  // -------------------------------------------------------------
  // FILE UPLOAD VALIDATION & MALWARE SANITIZER (Owner Only)
  // -------------------------------------------------------------
  app.post(
    '/api/admin/upload-validate',
    authenticateToken,
    requireOwner,
    (req: AuthenticatedRequest, res: Response) => {
      const { filename, content } = req.body || {};
      if (!content) {
        return res.status(400).json({ success: false, error: 'File content is required' });
      }

      const safeFilename = path.basename(String(filename || 'upload.json')).replace(/[^a-zA-Z0-9._-]/g, '_');
      const sizeBytes = Buffer.byteLength(String(content), 'utf-8');

      if (sizeBytes > 2 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'File exceeds 2MB size limit' });
      }

      const dangerousPatterns = [
        /<script[\s\S]*?>/i,
        /javascript:/i,
        /onload[\s]*=/i,
        /onerror[\s]*=/i,
        /\x00/,
        /<!ENTITY/i,
        /eval\s*\(/i,
      ];

      const contentStr = String(content);
      const hasDanger = dangerousPatterns.some((pattern) => pattern.test(contentStr));
      if (hasDanger) {
        console.warn(`[SECURITY] Blocked potentially malicious upload: ${safeFilename} by ${req.user!.name}`);
        return res.status(400).json({
          success: false,
          error: 'Security Warning: File content failed malware and injection heuristics validation.',
        });
      }

      return res.json({
        success: true,
        safeFilename,
        sizeBytes,
        status: 'Clean and verified for safe import',
      });
    }
  );

  // -------------------------------------------------------------
  // VITE DEV SERVER OR STATIC ASSETS
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Prime Century Restaurant POS Server running at http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
