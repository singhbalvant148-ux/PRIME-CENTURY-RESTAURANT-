import React, { useState } from 'react';
import {
  ShieldCheck,
  ArrowRight,
  Lock,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  KeyRound,
  X,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { UserRole } from '../types/pos';

export const LoginView: React.FC = () => {
  const { login, settings, users, resetEmployeePasswordSelf } = usePOS();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Employee Password Reset Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [resetMode, setResetMode] = useState<'code' | 'current_password'>('code');
  const [verificationCode, setVerificationCode] = useState('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordReset, setNewPasswordReset] = useState('');
  const [confirmPasswordReset, setConfirmPasswordReset] = useState('');
  const [showNewResetPass, setShowNewResetPass] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [isResetLoading, setIsResetLoading] = useState(false);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await login(username, password);
      if (!res.success) {
        setError(res.message || 'Invalid username or password.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenResetModal = () => {
    setResetUsername(username && username !== 'admin' ? username : '');
    setVerificationCode('');
    setCurrentPasswordInput('');
    setNewPasswordReset('');
    setConfirmPasswordReset('');
    setResetError('');
    setResetSuccess('');
    setShowNewResetPass(false);
    setIsResetModalOpen(true);
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');

    if (newPasswordReset !== confirmPasswordReset) {
      setResetError('Passwords do not match. Please re-enter the same password.');
      return;
    }
    if (newPasswordReset.trim().length < 4) {
      setResetError('New password must be at least 4 characters long.');
      return;
    }

    setIsResetLoading(true);
    try {
      const res = await resetEmployeePasswordSelf({
        username: resetUsername.trim(),
        newPassword: newPasswordReset.trim(),
        mode: resetMode,
        verificationCode: resetMode === 'code' ? verificationCode.trim() : undefined,
        currentPassword: resetMode === 'current_password' ? currentPasswordInput.trim() : undefined,
      });

      if (res.success) {
        setResetSuccess(res.message || 'Password reset successfully! You can now log in.');
        setTimeout(() => {
          setUsername(resetUsername.trim().toLowerCase());
          setPassword('');
          setIsResetModalOpen(false);
          setResetSuccess('');
        }, 1600);
      } else {
        setResetError(res.message || 'Password reset failed.');
      }
    } finally {
      setIsResetLoading(false);
    }
  };

  const roleDetails: Record<
    UserRole,
    { label: string; bg: string; text: string; desc: string; access: string[] }
  > = {
    owner: {
      label: 'Owner',
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      desc: 'Full system control, User Management, Menu Management, GST & Financial Reports',
      access: ['User & Password Management', 'Menu & Price Management', 'Tables & Billing', 'Daily Sales & Reports'],
    },
    manager: {
      label: 'Manager',
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      desc: 'Floor operations, view menu & take orders, kitchen oversight & billing',
      access: ['View Menu & Take Orders', 'Tables & Orders', 'Kitchen KOT', 'Billing Counter'],
    },
    cashier: {
      label: 'Cashier',
      bg: 'bg-emerald-100',
      text: 'text-emerald-800',
      desc: 'Handles table bills, view menu & take orders, cash/UPI payments, receipts',
      access: ['View Menu & Take Orders', 'Billing Counter', 'Cash / UPI / Card', 'Print Receipts'],
    },
    waiter: {
      label: 'Waiter',
      bg: 'bg-purple-100',
      text: 'text-purple-800',
      desc: 'Table service, view menu & take orders, and sends KOT to kitchen',
      access: ['Table Map', 'View Menu & Take Orders', 'Send KOT Tickets', 'Order Status'],
    },
    kitchen: {
      label: 'Kitchen Chef',
      bg: 'bg-rose-100',
      text: 'text-rose-800',
      desc: 'Live kitchen order screen (KDS) to track preparation and mark dishes ready',
      access: ['Kitchen KDS View', 'KOT Tickets', 'Dish Preparation Status', 'Special Instructions'],
    },
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-black p-1.5 shadow-xl mb-3.5 ring-1 ring-amber-500/20">
          <img
            src={settings.logoUrl || '/logo.svg'}
            alt={settings.name || 'Prime Century Restaurant Logo'}
            className="w-full h-full object-contain rounded-xl"
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          {settings.name || 'PRIMECENTURY RESTAURANT & CAFE'}
        </h1>
        <p className="text-xs text-neutral-500 mt-1">
          Restaurant Point of Sale · Secure Role-Based Authentication
        </p>
      </div>

      <div className="max-w-4xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sign In Credentials Card */}
        <div className="lg:col-span-5 bg-white py-8 px-6 shadow-sm border border-neutral-200 rounded-2xl">
          <div className="mb-6">
            <h2 className="text-base font-bold text-neutral-900">Sign In to POS</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Enter your assigned username and password to log in.
            </p>
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Username Input */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="Enter username"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                />
              </div>
            </div>

            {/* Password Input (Masked) with Reset Link */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-neutral-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleOpenResetModal}
                  className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <KeyRound className="w-3 h-3 text-amber-700" />
                  <span>Forgot / Reset Password?</span>
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-10 py-2 text-xs rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              <span>Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 pt-5 border-t border-neutral-200">
            <div className="flex items-center gap-2 text-[11px] text-neutral-500 justify-center">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Passwords secured with salted SHA-256 hashing</span>
            </div>
          </div>
        </div>

        {/* Registered Staff Accounts Reference Panel */}
        <div className="lg:col-span-7 bg-white p-6 shadow-sm border border-neutral-200 rounded-2xl">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-100">
            <div>
              <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Staff Accounts &amp; Roles ({users.length})</span>
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Each user authenticates with their own credentials. Click &quot;Select&quot; to quickly populate the username field.
              </p>
            </div>
          </div>

          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {users.map((user) => {
              const details = roleDetails[user.role];
              const isSelected = username.toLowerCase() === user.username.toLowerCase();

              return (
                <div
                  key={user.id}
                  className={`p-3.5 border rounded-xl transition-all ${
                    isSelected
                      ? 'border-neutral-900 bg-neutral-50/90 shadow-2xs'
                      : user.isActive
                      ? 'border-neutral-200 bg-white hover:bg-neutral-50/70'
                      : 'border-neutral-200 bg-neutral-50/50 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-neutral-900">{user.name}</span>
                        <span className="text-[11px] font-mono text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded font-semibold">
                          @{user.username}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${details?.bg} ${details?.text}`}
                        >
                          {details?.label}
                        </span>
                        {!user.isActive && (
                          <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                            Disabled
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-neutral-600 mt-1">{details?.desc}</p>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-neutral-500">
                        {details?.access.map((acc, i) => (
                          <span key={i} className="flex items-center gap-1 text-neutral-600">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            {acc}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!user.isActive}
                      onClick={() => {
                        setUsername(user.username);
                        setPassword('');
                        setError('');
                      }}
                      className={`shrink-0 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-neutral-900 text-white'
                          : user.isActive
                          ? 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200'
                          : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                      }`}
                      title={user.isActive ? `Fill username as @${user.username}` : 'Account disabled'}
                    >
                      {isSelected ? 'Selected' : 'Select'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500">
            <span className="font-semibold text-neutral-800">Initial Staff Default Passwords:</span>{' '}
            Manager: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">mgr123</code> · Cashier: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">cash123</code> · Waiter: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">wait123</code> · Kitchen: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">kitchen123</code>
            <p className="mt-1 text-[10px] text-neutral-400">Owner password is configured privately during restaurant setup and never exposed publicly.</p>
          </div>
        </div>
      </div>

      {/* Employee Password Reset Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-neutral-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Reset Staff Password</h3>
                  <p className="text-[11px] text-neutral-500">Set a new secure password for your account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleResetSubmit} className="p-6 space-y-4">
              {resetError && (
                <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{resetError}</span>
                </div>
              )}

              {resetSuccess && (
                <div className="p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{resetSuccess}</span>
                </div>
              )}

              {/* Username Input */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Staff Username
                </label>
                <input
                  type="text"
                  required
                  value={resetUsername}
                  onChange={(e) => setResetUsername(e.target.value.toLowerCase())}
                  placeholder="e.g. waiter, cashier, manager"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                />
              </div>

              {/* Reset Verification Method Selector */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Verification Method
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setResetMode('code')}
                    className={`py-1.5 px-2.5 rounded-lg border text-center font-medium transition-colors cursor-pointer ${
                      resetMode === 'code'
                        ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    Security PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetMode('current_password')}
                    className={`py-1.5 px-2.5 rounded-lg border text-center font-medium transition-colors cursor-pointer ${
                      resetMode === 'current_password'
                        ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    Current Password
                  </button>
                </div>
              </div>

              {/* Verification Code or Current Password */}
              {resetMode === 'code' ? (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Restaurant Security PIN / Master Code
                  </label>
                  <input
                    type="password"
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="Enter PIN (e.g. 1234 or ask Owner)"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Default system PIN: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono">1234</code> (or restaurant GSTIN).
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="Enter your existing password"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                  />
                </div>
              )}

              {/* New Password */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  New Password (min. 4 characters)
                </label>
                <div className="relative">
                  <input
                    type={showNewResetPass ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={newPasswordReset}
                    onChange={(e) => setNewPasswordReset(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-3 pr-10 py-2 text-xs rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewResetPass(!showNewResetPass)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    {showNewResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type={showNewResetPass ? 'text' : 'password'}
                  required
                  value={confirmPasswordReset}
                  onChange={(e) => setConfirmPasswordReset(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isResetLoading ? 'Updating...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
