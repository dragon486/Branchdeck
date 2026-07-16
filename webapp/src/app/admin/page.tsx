'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Lock, 
  Search, 
  Download, 
  ArrowLeft, 
  ShieldCheck, 
  Building2, 
  Calendar,
  Eye,
  EyeOff,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';

interface WaitlistEntry {
  id: string;
  full_name: string;
  email: string;
  company?: string;
  role?: string;
  created_at: string;
}

// Relative time formatting function
function getRelativeTimeString(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 10) return 'just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return dateString;
  }
}

// Role badge styling selector
const getRoleBadgeStyle = (role?: string): string => {
  const r = role?.toLowerCase() || '';
  if (r.includes('lead') || r.includes('manager') || r.includes('pm') || r.includes('head') || r.includes('director')) {
    return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
  }
  if (r.includes('ai') || r.includes('ml') || r.includes('data') || r.includes('nlp')) {
    return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
  }
  if (r.includes('founder') || r.includes('ceo') || r.includes('cto') || r.includes('exec') || r.includes('owner') || r.includes('president')) {
    return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  }
  if (r.includes('engineer') || r.includes('dev') || r.includes('programmer') || r.includes('coder') || r.includes('architect')) {
    return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
  }
  if (r.includes('design') || r.includes('ux') || r.includes('ui') || r.includes('front') || r.includes('artist')) {
    return 'bg-pink-500/10 text-pink-400 border border-pink-500/20';
  }
  return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
};

export default function AdminWaitlistDashboard() {
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Load saved token from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('branchdeck_admin_token');
    if (saved === 'branchdeck-admin-passkey') {
      setIsAuthenticated(true);
      fetchWaitlist('branchdeck-admin-passkey');
    }
  }, []);

  const fetchWaitlist = async (token: string, silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    
    setAuthError('');
    try {
      const res = await fetch(`/api/admin/waitlist?token=${token}`);
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Invalid passcode');
        }
        throw new Error('Failed to fetch waitlist database');
      }
      const data = await res.json();
      if (data.success) {
        setWaitlist(data.waitlist);
        setIsAuthenticated(true);
        localStorage.setItem('branchdeck_admin_token', token);
      } else {
        throw new Error(data.error || 'Server error');
      }
    } catch (err: any) {
      setAuthError(err.message);
      setIsAuthenticated(false);
      localStorage.removeItem('branchdeck_admin_token');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    const token = localStorage.getItem('branchdeck_admin_token') || passcode;
    if (token) {
      fetchWaitlist(token, true);
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchWaitlist(passcode);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setWaitlist([]);
    setPasscode('');
    setCurrentPage(1);
    localStorage.removeItem('branchdeck_admin_token');
  };

  // Filter signups based on search query
  const filteredWaitlist = useMemo(() => {
    setCurrentPage(1); // Reset page on filter change
    if (!searchQuery) return waitlist;
    const query = searchQuery.toLowerCase();
    return waitlist.filter(entry => 
      entry.full_name?.toLowerCase().includes(query) ||
      entry.email?.toLowerCase().includes(query) ||
      entry.company?.toLowerCase().includes(query) ||
      entry.role?.toLowerCase().includes(query)
    );
  }, [waitlist, searchQuery]);

  // Pagination bounds
  const paginatedWaitlist = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredWaitlist.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredWaitlist, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredWaitlist.length / itemsPerPage));

  // Statistics calculations
  const stats = useMemo(() => {
    const total = waitlist.length;
    const uniqueCompanies = new Set(
      waitlist
        .map(w => w.company?.trim().toLowerCase())
        .filter(c => c && c !== 'landing signup' && c !== 'not specified')
    ).size;
    
    const latestDate = waitlist.length > 0 
      ? new Date(waitlist[0].created_at).toLocaleDateString()
      : 'None';

    return { total, uniqueCompanies, latestDate };
  }, [waitlist]);

  // Export to CSV
  const handleExportCSV = () => {
    if (waitlist.length === 0) return;
    const headers = ['ID', 'Full Name', 'Email', 'Company', 'Role', 'Joined At'];
    const rows = waitlist.map(w => [
      w.id,
      w.full_name || '',
      w.email || '',
      w.company || '',
      w.role || '',
      w.created_at ? new Date(w.created_at).toLocaleString() : ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `branchdeck_waitlist_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header bar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Branchdeck</span>
              <span className="text-[10px] bg-blue-500/10 text-blue-400 font-semibold px-2 py-0.5 rounded-full border border-blue-500/20">Admin</span>
            </div>
          </div>
          {isAuthenticated && (
            <button 
              onClick={handleLogout}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-3.5 py-1.5 rounded-lg transition-colors border border-slate-750"
            >
              Sign Out
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-10 w-full flex flex-col items-center justify-center">
        {!isAuthenticated ? (
          /* Login Authentication view */
          <div className="w-full max-w-md bg-slate-900/80 border border-slate-850 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
            <div className="flex justify-center mb-6">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
                <Lock className="w-6 h-6" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-center text-slate-100">Admin Control Center</h2>
            <p className="text-xs text-slate-400 text-center mt-1.5">Enter passcode to view database waitlist signups.</p>
            
            <form onSubmit={handleLoginSubmit} className="mt-8 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-2">PASSCODE</label>
                <div className="relative">
                  <input
                    type={showPasscode ? "text" : "password"}
                    required
                    placeholder="Enter admin passcode"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3.5 py-2 text-sm text-slate-200 placeholder-slate-650 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode(!showPasscode)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {authError && (
                <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3.5 py-2.5 rounded-lg font-medium">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm py-2.5 rounded-lg transition-all shadow-md shadow-blue-600/15 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? "Authenticating..." : "Access Database"}
              </button>
            </form>
          </div>
        ) : (
          /* Main Dashboard waitlist views */
          <div className="w-full space-y-8">
            {/* Stats Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-slate-900/60 border border-slate-850 p-5 rounded-2xl flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold font-mono text-slate-100">{stats.total}</div>
                  <div className="text-xs text-slate-400 font-medium mt-0.5">Total Waitlist Signups</div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-850 p-5 rounded-2xl flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold font-mono text-slate-100">{stats.uniqueCompanies}</div>
                  <div className="text-xs text-slate-400 font-medium mt-0.5">Unique Companies</div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-850 p-5 rounded-2xl flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold font-mono text-slate-100">{stats.latestDate}</div>
                  <div className="text-xs text-slate-400 font-medium mt-0.5">Latest Registration</div>
                </div>
              </div>
            </div>

            {/* List & Filters card */}
            <div className="bg-slate-900/40 border border-slate-850 rounded-2xl shadow-md overflow-hidden">
              <div className="p-5 border-b border-slate-850 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/50">
                <div>
                  <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    <span>Waitlist Database Ledger</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Real-time listing of active client requests fetched from Supabase.</p>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Search bar */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search waitlist..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg pl-9 pr-3.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 w-full sm:w-56 transition-all"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-655 absolute left-3 top-2.5" />
                  </div>

                  {/* Refresh Button */}
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    title="Refresh List"
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 border border-slate-750 transition-all flex items-center justify-center disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>

                  {/* Export button */}
                  <button
                    onClick={handleExportCSV}
                    disabled={waitlist.length === 0}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 text-xs font-bold px-3.5 py-2 rounded-lg transition-colors border border-slate-750"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Table rendering */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-850 text-slate-450 uppercase font-semibold tracking-wider">
                      <th className="py-3 px-5">Name</th>
                      <th className="py-3 px-5">Email Address</th>
                      <th className="py-3 px-5">Company / Org</th>
                      <th className="py-3 px-5">Role / Position</th>
                      <th className="py-3 px-5 text-right">Registered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {paginatedWaitlist.length > 0 ? (
                      paginatedWaitlist.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-900/30 transition-colors">
                          <td className="py-3.5 px-5 font-medium text-slate-200">{entry.full_name}</td>
                          <td className="py-3.5 px-5 font-mono text-slate-350">{entry.email}</td>
                          <td className="py-3.5 px-5 text-slate-350">
                            {entry.company || <span className="text-slate-655 italic">Not specified</span>}
                          </td>
                          <td className="py-3.5 px-5">
                            {entry.role ? (
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium tracking-wide uppercase ${getRoleBadgeStyle(entry.role)}`}>
                                {entry.role}
                              </span>
                            ) : (
                              <span className="text-slate-655 italic">Not specified</span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-right text-slate-400 font-mono" title={entry.created_at ? new Date(entry.created_at).toLocaleString() : 'N/A'}>
                            {entry.created_at ? getRelativeTimeString(entry.created_at) : 'N/A'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-10 px-5 text-center text-slate-500 font-medium">
                          {isLoading ? "Fetching ledger records..." : "No matching registrations found."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filteredWaitlist.length > itemsPerPage && (
                <div className="p-4 border-t border-slate-850 bg-slate-900/30 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Showing <span className="font-semibold text-slate-200">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                    <span className="font-semibold text-slate-200">
                      {Math.min(currentPage * itemsPerPage, filteredWaitlist.length)}
                    </span> of{' '}
                    <span className="font-semibold text-slate-200">{filteredWaitlist.length}</span> signups
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 disabled:hover:bg-slate-800 transition-all border border-slate-750"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-400 px-2">
                      Page <span className="font-semibold text-slate-200">{currentPage}</span> of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 disabled:hover:bg-slate-800 transition-all border border-slate-750"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer copyright */}
      <footer className="border-t border-slate-900 py-6 bg-slate-950 text-center text-slate-500 text-xs mt-auto">
        <div>© 2026 Branchdeck, Inc. Waitlist Dashboard Control Console.</div>
      </footer>
    </div>
  );
}
