# Firestore Security Specification

## 1. Data Invariants
1. Orders must have a valid string `id`, numeric `orderNumber` >= 1, valid `tableId` >= 1, valid `status` in ['active', 'paid', 'cancelled'], and a non-empty `createdAt`.
2. Kitchen Order Tickets (`kots`) must have a valid string `id`, numeric `kotNumber` >= 1, valid parent `orderId`, and status in ['new', 'preparing', 'ready', 'served'].
3. Finalized Bills (`bills`) must have a unique `id`, non-empty `billNumber`, valid `grandTotal` >= 0, and non-empty `paidAt`. Once a bill is marked 'voided' or 'paid', critical fiscal amounts (`grandTotal`, `subtotal`) cannot be tampered with.
4. Tables (`tables`) must have a valid string `id`, `name`, and status in ['available', 'occupied', 'billed'].
5. Menu items (`menu_items`) must have a valid `name` and non-negative `price`.
6. System-wide default deny ensures arbitrary collections and unvalidated paths are completely blocked.

## 2. The "Dirty Dozen" Payloads
1. **Payload 1 (Order ID Poisoning)**: Order with 2KB string ID or malicious characters injected. Expected: REJECTED.
2. **Payload 2 (Ghost Field Attack)**: Order containing extra system backdoor `isAdmin: true`. Expected: REJECTED.
3. **Payload 3 (Negative Price Menu Item)**: MenuItem with `price: -500`. Expected: REJECTED.
4. **Payload 4 (Invalid Order Status)**: Order with `status: 'hacked'`. Expected: REJECTED.
5. **Payload 5 (Negative Bill Grand Total)**: Bill with `grandTotal: -100`. Expected: REJECTED.
6. **Payload 6 (KOT Status Spoofing)**: KOT with status `tampered`. Expected: REJECTED.
7. **Payload 7 (Unbounded Items Array Attack)**: Order with 10,000 array elements causing denial of wallet. Expected: REJECTED.
8. **Payload 8 (Arbitrary Collection Write)**: Write to `/system_config/passwords`. Expected: REJECTED.
9. **Payload 9 (Missing Required Bill Number)**: Bill document without `billNumber`. Expected: REJECTED.
10. **Payload 10 (Table Status Tamper)**: Table with invalid status `destroyed`. Expected: REJECTED.
11. **Payload 11 (Oversized Description Attack)**: MenuItem with 500KB text payload. Expected: REJECTED.
12. **Payload 12 (Negative Tax Rate)**: RestaurantSettings with `cgstRate: -25`. Expected: REJECTED.

## 3. Test Runner
Verified via security rules compile and test suites.
