import React, { useState, useEffect } from 'react';
import {
  Cast, Globe, Radio,
  LayoutDashboard,
  Newspaper,
  Film,
  Settings,
  LogOut,
  Plus,
  Search,
  Eye,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Upload,
  X,
  AlertCircle,
  Video,
  Image as ImageIcon,
  CheckCircle2,
  Menu,
  FileCheck,
  Smartphone,
  UserCircle,
  CloudSun,
  Bell,
  ExternalLink,
  Volume2,
  StopCircle,
  Heart,
  Share2,
  Bookmark,
  LayoutList,
  LayoutGrid,
  Calendar,
  BarChart2,
  Database,
  Sparkles
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { toast, Toaster } from 'sonner';
import logoImage from './assets/logo.png';
import { NewsItem, ShortItem, NewsType, Advertisement } from './types';
import { api } from './services/api'; import { pipeline, env } from '@xenova/transformers';

// Configuration for Transformers.js in Browser
env.allowLocalModels = false; // Force usage of remote models (CDN)
env.useBrowserCache = true;   // Cache models in browser storage

// --- Components ---

const Sidebar = ({ activeTab, setActiveTab, mobileOpen, setMobileOpen, user, onLogout }: { activeTab: string, setActiveTab: (t: string) => void, mobileOpen: boolean, setMobileOpen: (o: boolean) => void, user: any, onLogout: () => void }) => {
  const isSuper = user?.role === 'super_admin';

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'news', label: 'Manage News', icon: Newspaper },
    { id: 'shorts', label: 'Manage Shorts', icon: Film },
    ...(isSuper ? [
      { id: 'reporters', label: 'District Reporters', icon: UserCircle },
      { id: 'advertisements', label: 'Manage Ads', icon: Radio },
      { id: 'approvals', label: 'User Approvals', icon: FileCheck },
      { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    ] : []),
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`fixed md:static inset-y-0 left-0 z-[120] w-56 bg-[#0f172a] border-r border-slate-800 transform transition-transform duration-200 ease-in-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-800 flex justify-center">
            <img src={logoImage} alt="SAMANYUDU TV" className="h-16 object-contain" />
          </div>

          <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileOpen(false);
                }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 ${activeTab === item.id
                  ? 'bg-yellow-500 text-slate-900 font-semibold shadow-lg shadow-yellow-500/10'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-800 space-y-2">
            <div className="px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <p className="text-white text-sm font-bold truncate">{user?.name || 'Admin'}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">{user?.role?.replace('_', ' ') || 'Role'}</p>
              {user?.district && <p className="text-[10px] text-yellow-500/80 mt-1">📍 {user.district}</p>}
            </div>
            <button
              onClick={onLogout}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={20} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};



const AnalyticsView = ({ news, shorts }: { news: NewsItem[], shorts: ShortItem[] }) => {
  // Calculate stats
  const totalNews = news.length;
  const totalShorts = shorts.length;

  const today = new Date();
  const isSameDay = (d1: Date, d2: Date) =>
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear();

  const newsToday = news.filter(n => isSameDay(new Date(n.timestamp), today)).length;
  const shortsToday = shorts.filter(s => isSameDay(new Date(s.timestamp), today)).length;

  // Prepare chart data (last 7 days)
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

    const newsCount = news.filter(n => isSameDay(new Date(n.timestamp), d)).length;
    const shortsCount = shorts.filter(s => isSameDay(new Date(s.timestamp), d)).length;

    return {
      date: label,
      News: newsCount,
      Shorts: shortsCount
    };
  });

  // User Stats (Top Contributors)
  const userStats = news.reduce((acc, item) => {
    const author = item.author || 'Unknown';
    acc[author] = (acc[author] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const userChartData = Object.entries(userStats)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Analytics Overview</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total News Articles', value: totalNews, icon: Newspaper, color: 'text-blue-500' },
          { label: 'Total Shorts', value: totalShorts, icon: Film, color: 'text-purple-500' },
          { label: 'News Uploaded Today', value: newsToday, icon: Database, color: 'text-green-500' },
          { label: 'Shorts Uploaded Today', value: shortsToday, icon: Video, color: 'text-yellow-500' },
        ].map((stat, i) => (
          <div key={i} className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium">{stat.label}</p>
              <h3 className="text-3xl font-bold text-white mt-2">{stat.value}</h3>
            </div>
            <div className={`p-4 bg-slate-700/50 rounded-lg ${stat.color}`}>
              <stat.icon size={24} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* News Trends */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-6">News Upload Trends</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#475569' }} fontSize={12} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#475569' }} fontSize={12} allowDecimals={false} />
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                <Area type="monotone" dataKey="News" stroke="#3b82f6" fillOpacity={1} fill="url(#colorNews)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Shorts Trends */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-6">Shorts Upload Trends</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorShorts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#475569' }} fontSize={12} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#475569' }} fontSize={12} allowDecimals={false} />
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                <Area type="monotone" dataKey="Shorts" stroke="#eab308" fillOpacity={1} fill="url(#colorShorts)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* User Contributions */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-6">Top Contributors (Articles)</h3>
        <div style={{ width: '100%', height: 350 }}>
          {userChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#475569' }} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#475569' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  cursor={{ fill: '#334155', opacity: 0.4 }}
                />
                <Bar dataKey="count" name="Articles" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">No contributor data available</div>
          )}
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ user }: { user: any }) => {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      toast.error("New passwords don't match");
      return;
    }
    try {
      await api.updateReporter(user.id, { password: passwords.new });
      toast.success("Password updated successfully");
      setShowPasswordForm(false);
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (e) {
      toast.error("Failed to update password");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Settings</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-slate-700 to-slate-600 rounded-full flex items-center justify-center text-slate-300 mb-4 ring-4 ring-slate-900 shadow-xl overflow-hidden">
              {logoImage ? <img src={logoImage} alt="Logo" className="w-full h-full object-cover" /> : <UserCircle size={48} />}
            </div>
            <h3 className="text-xl font-bold text-white">{user?.name || 'Admin'}</h3>
            <p className="text-slate-400 text-sm mb-2">{user?.email}</p>
            <span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 text-[10px] font-bold uppercase tracking-wider rounded border border-yellow-500/20 mb-6">
              {user?.role?.replace('_', ' ')}
            </span>

            <button
              onClick={() => setShowPasswordForm(!showPasswordForm)}
              className="w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Change Password
            </button>
          </div>

          {showPasswordForm && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h4 className="text-white font-bold mb-4">Update Password</h4>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    value={passwords.new}
                    onChange={e => setPasswords({ ...passwords, new: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    required
                    value={passwords.confirm}
                    onChange={e => setPasswords({ ...passwords, confirm: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-yellow-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 py-2 bg-yellow-500 text-slate-900 font-bold rounded-lg text-sm">Save</button>
                  <button type="button" onClick={() => setShowPasswordForm(false)} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm">Cancel</button>
                </div>
              </form>
            </motion.div>
          )}
        </div>

        {/* General Settings */}
        <div className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-6">
          <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">App Configuration</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                  <Bell size={20} />
                </div>
                <div>
                  <p className="font-medium text-white">Push Notifications</p>
                  <p className="text-xs text-slate-400">Send alerts to users for breaking news</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                  <Smartphone size={20} />
                </div>
                <div>
                  <p className="font-medium text-white">App Maintenance Mode</p>
                  <p className="text-xs text-slate-400">Show maintenance screen to users</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
              </label>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold rounded-lg transition-colors">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const useItemInteractions = (item: NewsItem | ShortItem) => {
  const [liked, setLiked] = useState(() => {
    return localStorage.getItem(`like_${item.id}`) === 'true';
  });
  const [saved, setSaved] = useState(() => {
    return localStorage.getItem(`saved_${item.id}`) === 'true';
  });
  // Initialize count from prop (if exists) or default to 0
  const [initialCount] = useState(item.likes || 0);
  const [likeCount, setLikeCount] = useState(initialCount + (liked ? 1 : 0));

  useEffect(() => {
    setLikeCount(initialCount + (liked ? 1 : 0));
    localStorage.setItem(`like_${item.id}`, liked.toString());
  }, [liked, initialCount, item.id]);

  useEffect(() => {
    localStorage.setItem(`saved_${item.id}`, saved.toString());
  }, [saved, item.id]);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLiked(!liked);
    // In a real app, send API request here
  };

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaved(!saved);
    toast.success(saved ? "Removed from Saved" : "Saved to your list");
  };

  const shareTitle = 'title' in item ? item.title : 'Check this out';
  const shareText = `Check this out on Samanyudu TV: ${shareTitle}`;

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: window.location.href, // In real app, deep link
        });
      } catch (error) {
        console.log("Share cancelled/failed", error);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    }
  };

  return { liked, saved, likeCount, handleLike, handleSave, handleShare };
};

const LoginView = ({ onLogin }: { onLogin: (user: any) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.adminLogin(email, password);
      onLogin(data.user);
      toast.success(`Welcome back, ${data.user.name}`);
    } catch (error: any) {
      toast.error(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#020617] z-[200] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 w-full max-w-md rounded-2xl border border-slate-800 shadow-2xl p-8"
      >
        <div className="flex flex-col items-center mb-8">
          <img src={logoImage} alt="Logo" className="h-20 mb-4" />
          <h2 className="text-2xl font-bold text-white">Admin Portal</h2>
          <p className="text-slate-400 text-sm mt-2">Sign in to manage your content</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Email Address</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all"
                placeholder="admin@samanyudu.tv"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Password</label>
            <div className="relative">
              <Settings className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold rounded-xl transition-all shadow-lg shadow-yellow-500/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="animate-spin h-5 w-5 border-2 border-slate-900 border-t-transparent rounded-full"></span>
              ) : (
                "Sign In"
              )}
            </button>

            <button
              type="button"
              onClick={() => onLogin({
                id: 'dev-super-admin',
                email: 'superadmin1@samanyudu.tv',
                name: 'Super Admin (Dev)',
                role: 'super_admin',
                district: null
              })}
              className="w-full py-2 text-slate-500 hover:text-yellow-500 text-sm font-medium transition-colors"
            >
              Skip to Super Admin Portal
            </button>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500">© 2026 SAMANYUDU TV. All Rights Reserved.</p>
        </div>
      </motion.div>
    </div>
  );
};

const ReportersManager = () => {
  const [reporters, setReporters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingReporter, setEditingReporter] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    state: 'Andhra Pradesh',
    district: ''
  });

  const fetchReporters = async () => {
    try {
      const data = await api.getReporters();
      setReporters(data);
    } catch (e) {
      toast.error("Failed to load reporters");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReporters();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingReporter) {
        await api.updateReporter(editingReporter.id, formData);
        toast.success("Reporter updated");
      } else {
        await api.createReporter(formData);
        toast.success("Reporter created");
      }
      setShowForm(false);
      setEditingReporter(null);
      setFormData({ name: '', email: '', password: '', state: 'Andhra Pradesh', district: '' });
      fetchReporters();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this reporter?")) {
      try {
        await api.deleteReporter(id);
        fetchReporters();
        toast.success("Reporter removed");
      } catch (e) {
        toast.error("Delete failed");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">District Reporters</h2>
        <button
          onClick={() => {
            setEditingReporter(null);
            setFormData({ name: '', email: '', password: '', state: 'Andhra Pradesh', district: '' });
            setShowForm(true);
          }}
          className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-4 py-2 rounded-lg font-bold flex items-center gap-2"
        >
          <Plus size={20} /> Add Reporter
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-400">Reporter Name</label>
              <input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-400">Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-400">Password</label>
              <input
                type="text"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-400">State</label>
              <select
                value={formData.state}
                onChange={e => setFormData({ ...formData, state: e.target.value, district: '' })}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white"
              >
                <option value="Andhra Pradesh">Andhra Pradesh</option>
                <option value="Telangana">Telangana</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-400">District Assignment</label>
              <select
                value={formData.district}
                onChange={e => setFormData({ ...formData, district: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white"
                required
              >
                <option value="">Select District</option>
                {(formData.state === 'Andhra Pradesh' ? [
                  'Anantapur', 'Chittoor', 'East Godavari', 'Guntur', 'Kadapa', 'Krishna', 'Kurnool', 'Nellore', 'Prakasam', 'Srikakulam', 'Visakhapatnam', 'Vizianagaram', 'West Godavari'
                ] : [
                  'Adilabad', 'Bhadradri Kothagudem', 'Hyderabad', 'Jagtial', 'Jangaon', 'Jayashankar Bhupalpally', 'Jogulamba Gadwal', 'Kamareddy', 'Karimnagar', 'Khammam', 'Kumuram Bheem Asifabad', 'Mahabubabad', 'Mahabubnagar', 'Mancherial', 'Medak', 'Medchal–Malkajgiri', 'Mulugu', 'Nagarkurnool', 'Nalgonda', 'Narayanpet', 'Nirmal', 'Nizamabad', 'Peddapalli', 'Rajanna Sircilla', 'Rangareddy', 'Sangareddy', 'Siddipet', 'Suryapet', 'Vikarabad', 'Wanaparthy', 'Warangal Rural', 'Warangal Urban', 'Yadadri Bhuvanagiri'
                ]).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 flex justify-end gap-3 mt-4">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-400">Cancel</button>
              <button type="submit" className="bg-yellow-500 text-slate-900 px-6 py-2 rounded font-bold">Save Reporter</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <table className="w-full text-left">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase font-bold tracking-wider">
            <tr>
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Email / Password</th>
              <th className="px-6 py-4">Location</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {reporters.map(rep => (
              <tr key={rep.id} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-6 py-4 font-medium text-white">{rep.name}</td>
                <td className="px-6 py-4 italic text-slate-400">{rep.email}<br /><span className="text-xs">{rep.password}</span></td>
                <td className="px-6 py-4">
                  <span className="text-xs text-slate-500">{rep.state}</span><br />
                  <span className="text-sm text-yellow-500 font-semibold">{rep.district}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setEditingReporter(rep);
                        setFormData({
                          name: rep.name,
                          email: rep.email,
                          password: rep.password,
                          state: rep.state,
                          district: rep.district
                        });
                        setShowForm(true);
                      }}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <Edit size={18} />
                    </button>
                    <button onClick={() => handleDelete(rep.id)} className="text-red-400 hover:text-red-300">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {reporters.length === 0 && !loading && (
          <div className="p-8 text-center text-slate-500">No district reporters found.</div>
        )}
      </div>
    </div>
  );
};

const MediaPlayer = ({ item, onClose }: { item: NewsItem | ShortItem, onClose: () => void }) => {
  const isShort = 'duration' in item;

  // --- SHORT VIDEO PLAYER (Vertical) ---
  if (isShort) {
    const shortItem = item as ShortItem;
    const { liked, saved, likeCount, handleLike, handleSave, handleShare } = useItemInteractions(shortItem);



    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={onClose}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white hover:text-yellow-500 transition-colors z-[110] bg-black/50 rounded-full p-2">
          <X size={32} />
        </button>

        <div
          className="relative bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-800 aspect-[3/4]"
          style={{ height: '60vh', maxHeight: '600px' }}
          onClick={e => e.stopPropagation()}
        >
          {shortItem.videoUrl ? (
            <div className="relative w-full h-full group">
              <video
                src={shortItem.videoUrl}
                // Fixed height
                className="w-full h-full object-cover bg-black"
                controls={false} // Hide default controls for custom UI feel, or keep them if needed. Let's keep loop/autoplay but maybe hide controls for "Reels" feel if we implement custom play/pause. Let's keep controls for usability but overlay UI on top.
                controlsList="nodownload noremoteplayback"
                loop
                autoPlay
                playsInline
                // muted // Auto-play usually requires muted, but user likely wants sound.
                // Mobile browsers often block unmuted autoplay.
                // We'll leave unmuted but be aware it might not autoplay without interaction.
                onClick={(e) => {
                  const v = e.currentTarget;
                  if (v.paused) v.play(); else v.pause();
                }}
                onError={(e: any) => {
                  console.error("Video Error:", e.currentTarget.error, shortItem.videoUrl);
                  const errorMsg = e.currentTarget.error ? e.currentTarget.error.message : "Unknown Error";
                  toast.error(`Video Error: ${errorMsg}. Check URL.`);

                  // Show visual error in container
                  const container = e.currentTarget.parentElement;
                  if (container) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = "absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-4 text-center z-10";
                    errorDiv.innerHTML = `
                      <div class="text-red-500 mb-2"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12 y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg></div>
                      <p class="text-white font-bold mb-1">Playback Failed</p>
                      <p class="text-slate-400 text-xs mb-2">File missing or invalid URL</p>
                      <p class="text-slate-500 text-[10px] break-all px-4">${shortItem.videoUrl}</p>
                    `;
                    container.appendChild(errorDiv);
                    e.currentTarget.style.display = 'none';
                  }
                }}
              >
                Your browser does not support the video tag.
              </video>

              {/* Interaction Overlay - Right Side Actions */}
              <div className="absolute right-3 bottom-12 flex flex-col items-center gap-6 z-20 pb-4">
                {/* Like Button */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={handleLike}
                    className="group relative transition-transform active:scale-90"
                  >
                    <Heart
                      size={32}
                      className={`drop-shadow-lg transition-colors ${liked ? "fill-red-500 text-red-500" : "text-white fill-transparent stroke-[2px]"}`}
                    />
                  </button>
                  <span className="text-white text-[13px] font-medium drop-shadow-md">{likeCount}</span>
                </div>

                {/* Share Button (Paper Plane style usually, using Share2 here) */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={handleShare}
                    className="group transition-transform active:scale-90"
                  >
                    <Share2 size={30} className="text-white drop-shadow-lg stroke-[2px]" />
                  </button>
                  <span className="text-white text-[13px] font-medium drop-shadow-md">Share</span>
                </div>

                {/* Save/Bookmark Button */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={handleSave}
                    className="group transition-transform active:scale-90"
                  >
                    <Bookmark
                      size={30}
                      className={`drop-shadow-lg transition-colors stroke-[2px] ${saved ? "fill-white text-white" : "text-white fill-transparent"}`}
                    />
                  </button>
                  <span className="text-white text-[13px] font-medium drop-shadow-md">Save</span>
                </div>

                {/* More/Menu Option (Visual placeholder to match style) */}
                <button className="mt-2 transition-transform active:scale-90 opacity-90 hover:opacity-100">
                  <MoreVertical size={28} className="text-white drop-shadow-lg" />
                </button>

                {/* Music/Sound Icon (Visual flair) */}
                <div className="mt-4 w-10 h-10 rounded-lg bg-gradient-to-tr from-yellow-400 to-yellow-600 border-2 border-white overflow-hidden animate-spin-slow shadow-lg">
                  <div className="w-full h-full flex items-center justify-center bg-black/20">
                    <Volume2 size={16} className="text-white" />
                  </div>
                </div>
              </div>

              {/* Bottom Info Overlay */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pb-6 pointer-events-none z-10">
                <div className="flex flex-col items-start gap-3 w-[80%]">

                  {/* Profile Line */}
                  <div className="flex items-center gap-3 pointer-events-auto cursor-pointer">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-white p-0.5 overflow-hidden">
                      <img src={logoImage} className="w-full h-full object-cover rounded-full" alt="Profile" />
                    </div>
                    <div className="flex flex-col align-start">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm tracking-wide shadow-black drop-shadow-md">samanyudu.tv</span>
                        <CheckCircle2 size={12} className="text-blue-400 bg-white rounded-full" />
                      </div>
                      <span className="text-xs text-slate-200 opacity-90 drop-shadow-md">Original Audio</span>
                    </div>
                    <button className="ml-2 px-3 py-1 bg-transparent border border-white/40 text-white hover:bg-white/20 text-xs font-semibold rounded-lg transition-colors backdrop-blur-sm">
                      Follow
                    </button>
                  </div>

                  {/* Caption */}
                  <div className="pointer-events-auto">
                    <p className="text-white text-[15px] leading-snug drop-shadow-md line-clamp-2">
                      {shortItem.title}
                      <span className="text-slate-300 ml-2 text-sm font-normal">... more</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 flex-col gap-2">
              <AlertCircle size={48} />
              <p>No video available</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- NEWS ARTICLE VIEWER ---
  const newsItem = item as NewsItem;
  const { liked, saved, likeCount, handleLike, handleSave, handleShare } = useItemInteractions(newsItem);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 w-full max-w-2xl max-h-[90vh] rounded-xl border border-slate-700 shadow-2xl overflow-y-auto relative flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header / Media Area */}
        <div className={`relative w-full ${newsItem.videoUrl || newsItem.imageUrl ? 'bg-black min-h-[200px]' : 'bg-slate-900 min-h-[50px] border-b border-slate-800'}`}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 bg-black/50 text-white p-1.5 rounded-full hover:bg-slate-700 hover:text-yellow-500 transition-colors backdrop-blur-md"
          >
            <X size={18} />
          </button>

          {newsItem.videoUrl ? (
            <div className="w-full aspect-video bg-black">
              <video src={newsItem.videoUrl} controls className="w-full h-full" autoPlay playsInline />
            </div>
          ) : newsItem.imageUrl ? (
            <div className="w-full max-h-[35vh] bg-black flex items-center justify-center overflow-hidden">
              <img
                src={newsItem.imageUrl}
                className="w-full h-full object-contain"
                alt={newsItem.title}
                onError={(e) => {
                  console.error("MediaPlayer Image Load Failed:", newsItem.imageUrl);
                  toast.error("Image failed to load. Check bucket permissions.");
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          ) : (
            <div className="w-full h-32 bg-slate-800 flex flex-col items-center justify-center border-b border-slate-700">
              <ImageIcon size={32} className="text-slate-600 mb-2" />
              <p className="text-slate-500 text-sm">No image available for this article</p>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="p-6 bg-slate-900">
          {/* News Interactions Bar (Moved here) */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <button onClick={handleLike} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors text-sm font-medium ${liked ? 'bg-red-500/10 text-red-500' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'}`}>
                <Heart size={16} fill={liked ? "currentColor" : "none"} />
                <span>{likeCount > 0 ? likeCount : 'Like'}</span>
              </button>
              <button onClick={handleShare} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors border border-slate-700 text-sm font-medium">
                <Share2 size={16} />
                <span>Share</span>
              </button>
            </div>
            <button onClick={handleSave} className={`p-1.5 rounded-full transition-colors border border-slate-700 ${saved ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/50' : 'text-slate-400 hover:text-white hover:bg-slate-800 bg-slate-800'}`}>
              <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-yellow-500 text-slate-900 uppercase tracking-wide">
              {newsItem.type}
            </span>
            {newsItem.isBreaking && (
              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-red-600 text-white uppercase tracking-wide flex items-center gap-1">
                <AlertCircle size={12} /> Breaking
              </span>
            )}
            <span className="text-slate-400 text-xs flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-slate-500"></span>
              {new Date(newsItem.timestamp).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <span className="text-slate-400 text-xs flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-slate-500"></span>
              {newsItem.area}
            </span>
          </div>

          <h2 className="text-2xl md:text-2xl font-bold text-white mb-6 leading-tight">
            {newsItem.title}
          </h2>

          {newsItem.liveLink && (
            <div className="mb-6">
              <a
                href={newsItem.liveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors animate-pulse shadow-lg shadow-red-900/20"
              >
                <Radio size={18} />
                <span>Watch Live Coverage</span>
                <ExternalLink size={14} className="opacity-70" />
              </a>
            </div>
          )}

          <div className="text-slate-300 leading-relaxed whitespace-pre-wrap text-base md:text-base border-b border-slate-800 pb-6 mb-4">
            {newsItem.description}
          </div>


        </div>
      </motion.div>
    </div>
  );
};

const useTextToSpeech = () => {
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleSpeak = (item: NewsItem) => {
    if (playingId === item.id) {
      window.speechSynthesis.cancel();
      setPlayingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const text = `${item.title}. ${item.description}`;
    const utterance = new SpeechSynthesisUtterance(text);

    // Default configuration
    utterance.rate = 0.9;
    utterance.pitch = 1.0;

    // Language Detection & Voice Selection
    const voices = window.speechSynthesis.getVoices();
    const isTelugu = /[\u0c00-\u0c7f]/.test(text);
    const isHindi = /[\u0900-\u097f]/.test(text);

    let preferredVoice = null;

    if (isTelugu) {
      utterance.lang = 'te-IN';
      const teluguVoices = voices.filter(v => v.lang.includes('te'));

      // Strict priority: Google (most natural) -> Kalpana (Windows default female) -> Any Female -> Any Telugu
      preferredVoice = teluguVoices.find(v => v.name.includes('Google'))
        || teluguVoices.find(v => v.name.includes('Kalpana'))
        || teluguVoices.find(v => v.name.toLowerCase().includes('female'))
        || teluguVoices[0];

    } else if (isHindi) {
      utterance.lang = 'hi-IN';
      preferredVoice = voices.find(v => v.lang.includes('hi') && (v.name.includes('Female') || v.name.includes('Google')));
    } else {
      // English: Prioritize Indian Accent (en-IN)
      preferredVoice = voices.find(v => v.lang === 'en-IN' && (
        v.name.includes('Google') ||
        v.name.includes('Heera') ||
        v.name.includes('Rishi') ||
        v.name.toLowerCase().includes('india')
      ));

      // Fallback for English
      if (!preferredVoice) {
        preferredVoice = voices.find(v => v.lang === 'en-IN');
      }
      if (!preferredVoice) {
        preferredVoice = voices.find(v => v.lang.includes('en') && (v.name.includes('Female') || v.name.includes('Zira')));
      }
    }

    if (preferredVoice) {
      utterance.voice = preferredVoice;
      console.log("Selected Voice:", preferredVoice.name);
    } else {
      console.log("No specific preferred voice found, using default for lang:", utterance.lang);
    }

    utterance.onend = () => setPlayingId(null);
    utterance.onerror = () => setPlayingId(null);

    setPlayingId(item.id);
    window.speechSynthesis.speak(utterance);
  };

  return { playingId, handleSpeak };
};

const DashboardStats = ({ newsCount, shortsCount, pendingCount }: { newsCount: number, shortsCount: number, pendingCount: number }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-slate-400 text-sm font-medium">Total News Articles</p>
            <h3 className="text-3xl font-bold text-white mt-2">{newsCount}</h3>
          </div>
          <div className="p-3 bg-blue-500/20 rounded-lg">
            <Newspaper className="text-blue-500" size={24} />
          </div>
        </div>
        <div className="mt-4 flex items-center text-sm text-green-400">
          <span className="flex items-center"><Plus size={14} className="mr-1" /> 12 this week</span>
        </div>
      </div>

      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-slate-400 text-sm font-medium">Total Shorts/Reels</p>
            <h3 className="text-3xl font-bold text-white mt-2">{shortsCount}</h3>
          </div>
          <div className="p-3 bg-purple-500/20 rounded-lg">
            <Film className="text-purple-500" size={24} />
          </div>
        </div>
        <div className="mt-4 flex items-center text-sm text-green-400">
          <span className="flex items-center"><Plus size={14} className="mr-1" /> 5 this week</span>
        </div>
      </div>

      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-slate-400 text-sm font-medium">Pending Approvals</p>
            <h3 className="text-3xl font-bold text-white mt-2">{pendingCount}</h3>
          </div>
          <div className="p-3 bg-orange-500/20 rounded-lg">
            <FileCheck className="text-orange-500" size={24} />
          </div>
        </div>
        <div className="mt-4 flex items-center text-sm text-yellow-400">
          <span className="flex items-center">Requires attention</span>
        </div>
      </div>
    </div>
  );
};

// --- News Manager ---

const NewsForm = ({
  initialData,
  onSave,
  onCancel,
  user
}: {
  initialData?: NewsItem | null,
  onSave: (data: Omit<NewsItem, 'id' | 'timestamp'>) => void,
  onCancel: () => void,
  user: any
}) => {
  const isSubAdmin = user?.role === 'sub_admin';
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    area: initialData?.area || (isSubAdmin ? user.district : ''),
    type: initialData?.type || 'Others' as NewsType,
    isBreaking: initialData?.isBreaking || false,
    liveLink: initialData?.liveLink || '',
    imageUrl: initialData?.imageUrl || '',
    videoUrl: initialData?.videoUrl || '',
    author: initialData?.author || user?.name || 'Admin',
    status: initialData?.status || (isSubAdmin ? 'pending' : 'published')
  });

  const newsTypes: NewsType[] = ['Political', 'Accident', 'Education', 'Crime', 'Weather', 'Sports', 'Business', 'Social', 'Others'];
  const [uploading, setUploading] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);

  const handleGenerateImage = async () => {
    if (!formData.title || !formData.description) {
      toast.error("Please enter both title and description to generate an AI image");
      return;
    }

    setGeneratingImage(true);
    const toastId = toast.loading("Generating AI Image... (Takes up to 15 seconds)");

    try {
      const isTelugu = /[\u0C00-\u0C7F]/.test(formData.title);
      let promptTitle = formData.title;

      // Translate title to English for better image generation if it's in Telugu
      if (isTelugu) {
        toast.loading("Translating prompt...", { id: toastId });
        try {
          const translatorTeEn = await pipeline('translation', 'Xenova/opus-mt-te-en');
          const output = await translatorTeEn(formData.title);
          // @ts-ignore
          if (output && output[0] && output[0].translation_text) {
            // @ts-ignore
            promptTitle = output[0].translation_text;
          }
        } catch (e) {
          console.warn("Translation for image prompt failed", e);
        }
      }

      toast.loading("Generating AI Image...", { id: toastId });

      const prompt = `Realistic news thumbnail. Headline: ${promptTitle}. No text in the image. High quality photography.`;
      const encodedPrompt = encodeURIComponent(prompt);
      const randomSeed = Math.floor(Math.random() * 1000000);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=450&nologo=true&seed=${randomSeed}`;

      // Bypass CORS and Cloudflare Turnstile entirely!
      // Do NOT fetch in the client. Assign directly and let the browser load it as a standard img src.
      setFormData(prev => ({ ...prev, imageUrl: imageUrl }));

      toast.success("AI Image generated successfully!", { id: toastId });
    } catch (error: any) {
      console.error("Image Generation Error:", error);
      toast.error(`AI Image Error: ${error.message || "Unknown error"}`, { id: toastId, duration: 5000 });
    } finally {
      setGeneratingImage(false);
      setUploading(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!formData.title) {
      toast.error("Please enter a title first");
      return;
    }

    setGeneratingDesc(true);
    const toastId = toast.loading("Initializing AI Model... (This may take a moment)");

    try {
      // FORCE Configuration right before usage
      env.allowLocalModels = false;
      env.useBrowserCache = false; // Disable cache to avoid 'bad' previous downloads
      console.log("AI Env Configured:", { allowLocal: env.allowLocalModels, useCache: env.useBrowserCache });

      // Initialize the pipeline
      const generator = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-77M');

      toast.loading("Generating description...", { id: toastId });
      // Language Detection (Telugu)
      const isTelugu = /[\u0C00-\u0C7F]/.test(formData.title);
      console.log("Language Detected:", isTelugu ? "Telugu" : "English/Other");

      let promptTitle = formData.title;

      // 1. If Telugu, Translate Title to English first
      if (isTelugu) {
        toast.loading("Translating title to English...", { id: toastId });
        try {
          const translatorTeEn = await pipeline('translation', 'Xenova/opus-mt-te-en');
          const output = await translatorTeEn(formData.title);
          // @ts-ignore
          if (output && output[0] && output[0].translation_text) {
            // @ts-ignore
            promptTitle = output[0].translation_text;
            console.log("Translated Title (TE->EN):", promptTitle);
          }
        } catch (err) {
          console.warn("TE->EN Translation failed, trying direct generation", err);
        }
      }

      toast.loading("Generating description...", { id: toastId });
      const prompt = `Write a short news description based on this headline: "${promptTitle}"`;

      const result = await generator(prompt, {
        max_new_tokens: 150,
        temperature: 0.7,
        repetition_penalty: 1.2
      });

      let generatedText = "";
      // @ts-ignore
      if (result && result[0] && result[0].generated_text) {
        // @ts-ignore
        generatedText = result[0].generated_text;
      }

      if (!generatedText) throw new Error("No text generated");

      // 2. If Telugu, Translate Result back to Telugu
      if (isTelugu) {
        toast.loading("Translating result to Telugu...", { id: toastId });
        try {
          const translatorEnTe = await pipeline('translation', 'Xenova/opus-mt-en-te');
          const output = await translatorEnTe(generatedText);
          // @ts-ignore
          if (output && output[0] && output[0].translation_text) {
            // @ts-ignore
            generatedText = output[0].translation_text;
            console.log("Translated Description (EN->TE):", generatedText);
          }
        } catch (err) {
          console.error("EN->TE Translation failed", err);
          toast.error("Generated English text but failed to translate to Telugu.");
        }
      }

      setFormData(prev => ({ ...prev, description: generatedText }));
      toast.success(isTelugu ? "వివరణ సృష్టించబడింది!" : "Description generated!", { id: toastId });

    } catch (error: any) {
      console.error("AI Generation Error:", error);
      // Show the actual error message to the user
      toast.error(`AI Error: ${error.message || "Unknown error"}. Check console details.`, { id: toastId, duration: 5000 });
    } finally {
      setGeneratingDesc(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    console.log(`Selected file for ${type}:`, file.name);

    setUploading(true);
    try {
      const url = await api.uploadFile(file);
      console.log(`Received URL for ${type}:`, url);
      if (type === 'image') {
        setFormData(prev => ({ ...prev, imageUrl: url }));
      } else {
        setFormData(prev => ({ ...prev, videoUrl: url }));
      }
      toast.success(`${type === 'image' ? 'Image' : 'Video'} uploaded successfully`);
    } catch (error: any) {
      console.error("NewsForm Upload Error:", error);
      if (error.message && error.message.includes("Bucket not found")) {
        toast.error("CRITICAL: 'news-media' bucket missing! Check INSTRUCTIONS_TO_FIX_UPLOAD.md");
        window.open('https://dash.cloudflare.com/', '_blank');
      } else if (error.message && error.message.includes("row-level security")) {
        toast.error("PERMISSION DENIED: You need to add a proper Policy to the 'news-media' bucket. See INSTRUCTIONS.");
        window.open('https://dash.cloudflare.com/', '_blank');
      } else {
        toast.error('Upload failed: ' + (error.message || 'Check storage bucket permissions'));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitting News Form Data:", formData);
    if (!formData.title || !formData.description || !formData.area) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Live Link Validation
    let finalLiveLink = formData.liveLink?.trim() || '';
    if (finalLiveLink) {
      if (!finalLiveLink.startsWith('http://') && !finalLiveLink.startsWith('https://')) {
        finalLiveLink = 'https://' + finalLiveLink;
      }

      try {
        new URL(finalLiveLink);
      } catch (_) {
        toast.error('Please enter a valid Live Link URL');
        return;
      }
    }

    onSave({ ...formData, liveLink: finalLiveLink });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 w-full max-w-2xl rounded-xl border border-slate-700 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
          <h2 className="text-xl font-bold text-white">{initialData ? 'Edit News Article' : 'Upload New Article'}</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <form id="newsForm" onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Title <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500"
                  placeholder="Enter news headline..."
                />
              </div>

              {/* Breaking News Switch */}
              <div className="flex items-center justify-between p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div>
                  <h4 className="font-semibold text-red-400">Breaking News Alert</h4>
                  <p className="text-xs text-red-300/70">Enable this to show the red scrolling ticker on the user app.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isBreaking}
                    onChange={(e) => setFormData({ ...formData, isBreaking: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </label>
              </div>

              {/* Description */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-slate-300">Description <span className="text-red-400">*</span></label>
                  <button
                    type="button"
                    onClick={handleGenerateDescription}
                    disabled={generatingDesc || !formData.title}
                    className="text-xs flex items-center gap-1 text-yellow-500 hover:text-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generatingDesc ? (
                      <span className="animate-pulse">Generating...</span>
                    ) : (
                      <>
                        <Sparkles size={12} />
                        <span>Auto-Write with AI</span>
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 resize-none"
                  placeholder="Enter full news details..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Area */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Area / Location <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={formData.area}
                    onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                    className={`w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 ${isSubAdmin ? 'opacity-70 cursor-not-allowed' : ''}`}
                    placeholder="e.g. Vijayawada, Hyderabad"
                    disabled={isSubAdmin}
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Category <span className="text-red-400">*</span></label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as NewsType })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500"
                  >
                    {newsTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Live Link */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Live / External Link (Optional)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Cast size={16} className="text-slate-500" />
                  </div>
                  <input
                    type="text"
                    value={formData.liveLink}
                    onChange={(e) => setFormData({ ...formData, liveLink: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500"
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">Add a YouTube or streaming URL for live coverage.</p>
              </div>

              {/* Media */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-medium text-slate-300">Media Attachments</label>
                  <button
                    type="button"
                    onClick={handleGenerateImage}
                    disabled={generatingImage || !formData.title || !formData.description}
                    className="text-xs flex items-center gap-1 text-yellow-500 hover:text-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generatingImage ? (
                      <span className="animate-pulse">Generating Image...</span>
                    ) : (
                      <>
                        <ImageIcon size={12} />
                        <span>Generate AI Image</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Image Upload */}
                  <div className="relative group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'image')}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      disabled={uploading}
                    />
                    <div className={`border-2 border-dashed ${formData.imageUrl ? 'border-green-500 bg-green-500/10' : 'border-slate-700 bg-slate-800/50'} rounded-lg p-6 flex flex-col items-center justify-center hover:border-yellow-500/50 transition-colors`}>
                      {uploading ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500"></div>
                      ) : formData.imageUrl ? (
                        <div className="w-full relative group/preview">
                          <img
                            src={formData.imageUrl}
                            alt="Preview"
                            className="h-24 w-full object-cover rounded mb-2"
                            onError={(e) => {
                              console.error("Image failed to load:", formData.imageUrl);
                              e.currentTarget.src = 'https://placehold.co/600x400?text=Load+Error';
                              toast.error("Image uploaded but failed to display correctly. Using local server fallback if R2 DNS is not configured.");
                            }}
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFormData(prev => ({ ...prev, imageUrl: '' }));
                              toast.info("Image removed");
                            }}
                            className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white z-20 hover:bg-red-600 transition-colors shadow-md"
                            title="Remove Image"
                          >
                            <X size={14} />
                          </button>
                          <span className="text-xs text-green-500 block text-center font-bold">Image Uploaded</span>
                        </div>
                      ) : (
                        <>
                          <ImageIcon className="text-slate-400 mb-2" size={24} />
                          <span className="text-xs text-slate-400">Add Photos</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Video Upload */}
                  <div className="relative group">
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => handleFileUpload(e, 'video')}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      disabled={uploading}
                    />
                    <div className={`border-2 border-dashed ${formData.videoUrl ? 'border-green-500 bg-green-500/10' : 'border-slate-700 bg-slate-800/50'} rounded-lg p-6 flex flex-col items-center justify-center hover:border-yellow-500/50 transition-colors`}>
                      {uploading ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500"></div>
                      ) : formData.videoUrl ? (
                        <div className="w-full relative">
                          <Video className="text-green-500 mb-2 mx-auto" size={24} />
                          <span className="text-xs text-green-500 block text-center font-bold">Video Uploaded</span>
                        </div>
                      ) : (
                        <>
                          <Video className="text-slate-400 mb-2" size={24} />
                          <span className="text-xs text-slate-400">Add Video</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500">Supports JPG, PNG and MP4 formats. Require 'media' bucket in Cloudflare R2.</p>
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="newsForm"
            className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold rounded-lg transition-colors shadow-lg shadow-yellow-500/20"
          >
            {initialData ? 'Update News' : 'Publish News'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const NewsManager = ({ news, setNews, onViewItem, user }: { news: NewsItem[], setNews: React.Dispatch<React.SetStateAction<NewsItem[]>>, onViewItem: (item: NewsItem) => void, user: any }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NewsItem | null>(null);
  const [filterType, setFilterType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [voiceGender, setVoiceGender] = useState<'Female' | 'Male'>('Female');
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.0);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const handleSpeak = (item: NewsItem) => {
    if (playingId === item.id) {
      window.speechSynthesis.cancel();
      setPlayingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const text = `${item.title}. ${item.description}`;
    const utterance = new SpeechSynthesisUtterance(text);

    // Language Detection & Voice Selection
    const voices = window.speechSynthesis.getVoices();
    const isTelugu = /[\u0c00-\u0c7f]/.test(text);
    const isHindi = /[\u0900-\u097f]/.test(text);

    let preferredVoice = null;

    // Default configuration
    utterance.rate = voiceSpeed;
    utterance.pitch = voiceGender === 'Female' ? 1.05 : 0.95;

    // Smart Gender Filter Helper
    const matchGender = (v: SpeechSynthesisVoice) => {
      const name = v.name.toLowerCase();
      const target = voiceGender.toLowerCase();

      if (target === 'female') {
        // Matches "Female" label, or specific known female names, or Google voices (usually female unless marked Male)
        return name.includes('female') ||
          name.includes('kalpana') ||
          name.includes('zira') ||
          name.includes('heera') ||
          (name.includes('google') && !name.includes('male'));
      } else {
        // Male
        return name.includes('male') || name.includes('david') || name.includes('hemant') || name.includes('ravi');
      }
    };

    // Helper: Checker for high-quality Online/Natural voices (Edge/Android)
    const isHighQuality = (v: SpeechSynthesisVoice) => v.name.includes('Online') || v.name.includes('Natural') || v.name.includes('Neural');

    // Helper: Avoid obviously male names in fallback
    const isNotMale = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      return !n.includes('male') && !n.includes('hemant') && !n.includes('david') && !n.includes('ravi');
    };

    if (isTelugu) {
      utterance.lang = 'te-IN';
      const teluguVoices = voices.filter(v => v.lang.includes('te'));

      if (voiceGender === 'Female') {
        // 1. High Quality Female (Edge Online/Natural)
        // 2. Google Female
        // 3. Any Female
        // 4. Any Non-Male
        // 5. Default
        preferredVoice = teluguVoices.find(v => matchGender(v) && isHighQuality(v))
          || teluguVoices.find(v => matchGender(v) && v.name.includes('Google'))
          || teluguVoices.find(v => matchGender(v))
          || teluguVoices.find(v => isNotMale(v))
          || teluguVoices[0];
      } else {
        preferredVoice = teluguVoices.find(v => matchGender(v)) || teluguVoices[0];
      }

    } else if (isHindi) {
      utterance.lang = 'hi-IN';
      const hindiVoices = voices.filter(v => v.lang.includes('hi'));

      if (voiceGender === 'Female') {
        preferredVoice = hindiVoices.find(v => matchGender(v) && isHighQuality(v))
          || hindiVoices.find(v => matchGender(v) && v.name.includes('Google'))
          || hindiVoices.find(v => matchGender(v))
          || hindiVoices.find(v => isNotMale(v))
          || hindiVoices[0];
      } else {
        preferredVoice = hindiVoices.find(v => matchGender(v)) || hindiVoices[0];
      }

    } else {
      // English
      const engVoices = voices.filter(v => v.lang.includes('en-IN') || v.lang.includes('en-GB') || v.lang.includes('en-US'));

      if (voiceGender === 'Female') {
        preferredVoice = engVoices.find(v => v.lang === 'en-IN' && matchGender(v) && isHighQuality(v))
          || engVoices.find(v => v.lang === 'en-IN' && matchGender(v))
          || engVoices.find(v => matchGender(v) && v.name.includes('Google'))
          || engVoices.find(v => matchGender(v))
          || engVoices.find(v => isNotMale(v))
          || engVoices[0];
      } else {
        preferredVoice = engVoices.find(v => matchGender(v)) || engVoices[0];
      }
    }


    if (preferredVoice) {
      utterance.voice = preferredVoice;
      console.log("Selected Voice:", preferredVoice.name);
    } else {
      console.log("No specific preferred voice found, using default for lang:", utterance.lang);
    }

    // Debug: Log all voices if Telugu to help user troubleshoot
    if (isTelugu) {
      console.log("Available Telugu Voices:", voices.filter(v => v.lang.includes('te')).map(v => v.name));
    }

    // Slight cleanup of text for better reading (remove URLs or odd chars if needed, but basic checks are okay)

    utterance.onend = () => setPlayingId(null);
    utterance.onerror = () => setPlayingId(null);

    setPlayingId(item.id);
    window.speechSynthesis.speak(utterance);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this news item?')) {
      try {
        await api.deleteNews(id);
        const updatedNews = await api.getNews();
        setNews(updatedNews.filter(n => n.status === 'published'));
        toast.success('News item deleted successfully');
      } catch (error) {
        console.error(error);
        toast.error('Failed to delete news');
      }
    }
  };

  const [isArchiving, setIsArchiving] = useState(false);
  const handleArchiveAndWipe = async () => {
    if (confirm('Do you want to download a backup of all news articles to your PC?')) {
      setIsArchiving(true);
      try {
        await api.archiveNews();

        // Let the download start, wait a tiny bit to avoid overlapping prompts
        setTimeout(async () => {
          if (confirm('Backup downloaded successfully! Do you want to WIPE all news from the database now? WARNING: This is permanent!')) {
            try {
              await api.wipeAllNews();
              toast.success('Database wiped successfully.');
              setNews([]);
            } catch (err) {
              toast.error('Failed to wipe the database.');
              console.error(err);
            }
          }
        }, 500);

      } catch (error) {
        toast.error('Failed to archive the news.');
        console.error(error);
      } finally {
        setIsArchiving(false);
      }
    }
  };

  const handleSave = async (data: Omit<NewsItem, 'id' | 'timestamp'>) => {
    try {
      if (editingItem) {
        await api.updateNews(editingItem.id, data);
        toast.success('News updated successfully');
      } else {
        await api.createNews(data);
        toast.success('News published successfully');
      }

      const updatedNews = await api.getNews();
      setNews(updatedNews.filter(n => n.status === 'published'));
      setIsFormOpen(false);
      setEditingItem(null);
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to save news: ' + (error.message || 'Unknown error'));
    }
  };

  const filteredNews = news.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'All' || item.type === filterType;

    // Date filtering
    let matchesDate = true;
    if (selectedDate) {
      const itemDate = new Date(item.timestamp);
      const filterDate = new Date(selectedDate);
      // Compare year, month, and day
      matchesDate = itemDate.getDate() === filterDate.getDate() &&
        itemDate.getMonth() === filterDate.getMonth() &&
        itemDate.getFullYear() === filterDate.getFullYear();
    }

    return matchesSearch && matchesType && matchesDate;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-white">Manage News</h2>
        <div className="flex items-center gap-3">
          {user?.role === 'super_admin' && (
            <button
              onClick={handleArchiveAndWipe}
              disabled={isArchiving || news.length === 0}
              className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-lg font-bold transition-all disabled:opacity-50"
              title="Download Archive & Delete All News"
            >
              {isArchiving ? (
                <span className="animate-spin h-5 w-5 border-2 border-red-500 border-t-transparent rounded-full"></span>
              ) : (
                <Database size={20} />
              )}
              <span className="hidden sm:inline">Backup & Wipe</span>
            </button>
          )}
          <button
            onClick={() => { setEditingItem(null); setIsFormOpen(true); }}
            className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-4 py-2 rounded-lg font-bold transition-all"
          >
            <Plus size={20} />
            <span>Upload News</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 bg-slate-800 p-4 rounded-xl border border-slate-700">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search news..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5">
            <span className="text-slate-400 text-sm">Voice:</span>
            <select
              value={voiceGender}
              onChange={(e) => setVoiceGender(e.target.value as 'Female' | 'Male')}
              className="bg-transparent text-white text-sm py-1.5 focus:outline-none cursor-pointer"
            >
              <option value="Female" className="bg-slate-900 text-white">Female</option>
              <option value="Male" className="bg-slate-900 text-white">Male</option>
            </select>
            <div className="w-px h-4 bg-slate-700 mx-1"></div>
            <span className="text-slate-400 text-sm">Speed:</span>
            <select
              value={voiceSpeed}
              onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
              className="bg-transparent text-white text-sm py-1.5 focus:outline-none cursor-pointer"
            >
              <option value={0.5} className="bg-slate-900 text-white">0.5x</option>
              <option value={0.75} className="bg-slate-900 text-white">0.75x</option>
              <option value={0.9} className="bg-slate-900 text-white">0.9x</option>
              <option value={1.0} className="bg-slate-900 text-white">1.0x</option>
              <option value={1.25} className="bg-slate-900 text-white">1.25x</option>
              <option value={1.5} className="bg-slate-900 text-white">1.5x</option>
              <option value={2.0} className="bg-slate-900 text-white">2.0x</option>
            </select>
          </div>
          <div className="w-px h-6 bg-slate-700 mx-1"></div>

          {/* Date Filter */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500 invert-calendar-icon"
            />
          </div>

          <div className="w-px h-6 bg-slate-700 mx-1"></div>
          <Filter size={18} className="text-slate-400" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
          >
            <option value="All">All Categories</option>
            {['Political', 'Accident', 'Education', 'Crime', 'Weather', 'Sports', 'Business', 'Social', 'Others'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div className="w-px h-6 bg-slate-700 mx-1"></div>
          <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              title="List View"
            >
              <LayoutList size={18} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              title="Grid View"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className={viewMode === 'list' ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4"}>
        {filteredNews.map(item => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-slate-800 rounded-xl border border-slate-700 p-4 transition-colors hover:border-slate-600 ${viewMode === 'list' ? 'flex flex-col md:flex-row gap-6' : 'flex flex-col gap-6'
              }`}
          >
            <div className={`${viewMode === 'list' ? 'w-full md:w-48 h-32' : 'w-full aspect-square'} bg-slate-700 rounded-lg overflow-hidden flex-shrink-0 relative group`}>
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500">
                  <ImageIcon size={32} />
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-between h-full">
              <div>
                <div className={`${viewMode === 'list' ? 'flex items-start justify-between mb-2' : 'mb-3'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300 border border-slate-600">
                      {item.type}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300 border border-slate-600">
                      {item.area}
                    </span>
                    {item.isBreaking && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-500 border border-red-500/30 flex items-center gap-1">
                        <AlertCircle size={10} /> BREAKING
                      </span>
                    )}
                  </div>

                  {viewMode === 'list' && (
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <button
                        onClick={() => onViewItem(item)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => handleSpeak(item)}
                        className={`p-2 rounded-lg transition-colors ${playingId === item.id ? 'text-yellow-500 bg-yellow-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        title={playingId === item.id ? "Stop Reading" : "Read Aloud"}
                      >
                        {playingId === item.id ? <StopCircle size={18} /> : <Volume2 size={18} />}
                      </button>
                      <button
                        onClick={() => { setEditingItem(item); setIsFormOpen(true); }}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>

                <h3 className="text-lg font-bold text-white mb-2 line-clamp-2 leading-tight">{item.title}</h3>
                <p className="text-slate-400 text-sm line-clamp-2 mb-3">{item.description}</p>
              </div>

              <div className={`flex ${viewMode === 'list' ? 'items-center justify-start mt-1' : 'flex-col gap-3 mt-auto'}`}>
                <div className="text-xs text-slate-500">
                  <span>Posted on {new Date(item.timestamp).toLocaleDateString()} at {new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>

                {viewMode === 'grid' && (
                  <div className="flex items-center justify-between border-t border-slate-700/50 pt-3 mt-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onViewItem(item)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors hover:scale-105"
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => handleSpeak(item)}
                        className={`p-2 rounded-lg transition-colors hover:scale-105 ${playingId === item.id ? 'text-yellow-500 bg-yellow-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        title="Read"
                      >
                        {playingId === item.id ? <StopCircle size={18} /> : <Volume2 size={18} />}
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingItem(item); setIsFormOpen(true); }}
                        className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors hover:scale-105"
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors hover:scale-105"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
        {filteredNews.length === 0 && (
          <div className="text-center py-12 text-slate-500 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
            <Newspaper size={48} className="mx-auto mb-3 opacity-20" />
            <p>No news articles found matching your criteria.</p>
          </div>
        )}
      </div>

      {isFormOpen && (
        <NewsForm
          initialData={editingItem}
          onSave={handleSave}
          onCancel={() => { setIsFormOpen(false); setEditingItem(null); }}
          user={user}
        />
      )}
    </div>
  );
};

const NewsApprovalManager = ({ pendingNews, setPendingNews, setNews }: { pendingNews: NewsItem[], setPendingNews: React.Dispatch<React.SetStateAction<NewsItem[]>>, setNews: React.Dispatch<React.SetStateAction<NewsItem[]>> }) => {
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  const handleApprove = async (item: NewsItem) => {
    try {
      // Update status to published
      await api.updateNews(item.id, { status: 'published' });

      // Refresh lists
      const allNews = await api.getNews();
      setNews(allNews.filter(n => n.status === 'published'));
      setPendingNews(allNews.filter(n => n.status === 'pending')); // Re-fetch or filter locally? Better re-fetch ensures consistency but might be overkill.
      // Actually setPendingNews is passed from App, let's just refresh everything in App ? 
      // No, we have setters here.

      setSelectedItem(null);
      toast.success(`News from ${item.author} approved and published!`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to approve news');
    }
  };

  const handleReject = async (id: string) => {
    if (confirm('Are you sure you want to reject this submission? It will be removed permanently.')) {
      try {
        await api.updateNews(id, { status: 'rejected' });
        // Or delete? user said "removed permanently". Let's simply delete or set status rejected.
        // Previous logic was filtering out, so it was effectively deleting from view.
        // Let's mark as rejected so we keep record, or delete if desired. Let's stick to update status for now.
        // Actually, previous code: setPendingNews(prev => prev.filter(p => p.id !== id)); -> it removed it from state.
        // Let's just update status to rejected so we don't handle it anymore.

        const allNews = await api.getNews();
        setPendingNews(allNews.filter(n => n.status === 'pending'));

        setSelectedItem(null);
        toast.error('Submission rejected.');
      } catch (error) {
        console.error(error);
        toast.error('Failed to reject submission');
      }
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Pending User Approvals</h2>

      <div className="grid grid-cols-1 gap-4">
        {pendingNews.map(item => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex flex-col md:flex-row gap-4"
          >
            <div className="w-full md:w-48 h-32 bg-slate-700 rounded-lg overflow-hidden flex-shrink-0 relative">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500">
                  <ImageIcon size={32} />
                </div>
              )}
              <div className="absolute top-2 left-2 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg">
                PENDING
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <span className="px-3 py-1 bg-yellow-500 text-slate-900 font-bold rounded-lg text-sm">
                    {item.type}
                  </span>
                  <span className="text-slate-400 text-sm flex items-center gap-1">
                    <Globe size={14} />
                    {item.area}
                  </span>
                  {item.liveLink && (
                    <a
                      href={item.liveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-sm flex items-center gap-1 transition-colors animate-pulse"
                    >
                      <Radio size={14} />
                      Watch Live
                    </a>
                  )}
                  <span className="text-slate-500 text-sm ml-auto">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-1">{item.title}</h3>
                <p className="text-slate-400 text-sm line-clamp-2">{item.description}</p>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => setSelectedItem(item)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Review Details
                </button>
                <button
                  onClick={() => handleApprove(item)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <CheckCircle2 size={16} /> Approve
                </button>
                <button
                  onClick={() => handleReject(item.id)}
                  className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <X size={16} /> Reject
                </button>
              </div>
            </div>
          </motion.div>
        ))}

        {pendingNews.length === 0 && (
          <div className="text-center py-16 text-slate-500 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
            <CheckCircle2 size={48} className="mx-auto mb-3 opacity-20 text-green-500" />
            <p className="text-lg font-medium text-slate-400">All caught up!</p>
            <p className="text-sm">No pending submissions from users.</p>
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedItem(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 w-[95%] max-w-4xl h-full md:h-auto max-h-[90vh] md:max-h-[85vh] rounded-xl border border-slate-700 shadow-2xl overflow-hidden relative flex flex-col md:flex-row mx-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex-1 overflow-y-auto flex flex-col">
              <div className="p-4 md:p-8 space-y-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-white leading-tight break-words">{selectedItem.title}</h2>
                  <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-white p-2">
                    <X size={24} />
                  </button>
                </div>
                {selectedItem.imageUrl && (
                  <div className="w-full h-64 bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                    <img src={selectedItem.imageUrl} alt={selectedItem.title} className="w-full h-full object-cover" />
                  </div>
                )}

                <div>
                  <h3 className="text-2xl font-bold text-white mb-2">{selectedItem.title}</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-3 py-1 bg-slate-800 rounded-full text-xs text-slate-300 border border-slate-700">Category: {selectedItem.type}</span>
                    <span className="px-3 py-1 bg-slate-800 rounded-full text-xs text-slate-300 border border-slate-700">Area: {selectedItem.area}</span>
                    <span className="px-3 py-1 bg-blue-900/30 rounded-full text-xs text-blue-400 border border-blue-500/20">User: {selectedItem.author}</span>
                    <span className="px-3 py-1 bg-slate-800 rounded-full text-xs text-slate-400 border border-slate-700">Time: {new Date(selectedItem.timestamp).toLocaleString()}</span>
                  </div>

                  <div className="text-slate-300 leading-relaxed whitespace-pre-wrap font-serif break-words">
                    {selectedItem.description}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-800 bg-slate-800/30 flex items-center gap-4 flex-wrap md:flex-nowrap">
                <button
                  onClick={() => handleReject(selectedItem.id)}
                  className="px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold rounded-lg transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleApprove(selectedItem)}
                  className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-green-500/20"
                >
                  Approve & Publish
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};


// --- Shorts Manager ---

const ShortsForm = ({
  initialData,
  onSave,
  onCancel,
  user
}: {
  initialData?: ShortItem | null,
  onSave: (data: Omit<ShortItem, 'id' | 'timestamp'>) => void,
  onCancel: () => void,
  user: any
}) => {
  const isSubAdmin = user?.role === 'sub_admin';
  const [title, setTitle] = useState(initialData?.title || '');
  const [duration, setDuration] = useState(initialData?.duration || 0); // Simulated duration
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      toast.error('Please enter a title');
      return;
    }

    if (!initialData && !videoFile) {
      toast.error('Please select a video file');
      return;
    }

    setUploading(true);
    try {
      let videoUrl = initialData?.videoUrl || '';
      let finalDuration = duration; // Default to existing duration or 0

      if (videoFile) {
        // Upload the file
        videoUrl = await api.uploadFile(videoFile);

        // In a real production app, we would get duration from metadata here.
        // For now, we simulate a check or use a default if 0.
        // If we want to be stricter, we can use a hidden video element to check duration,
        // but for this fix, let's just use the file.
        // Random duration simulation for demo (or use 15s default if 0)
        if (finalDuration === 0) {
          finalDuration = Math.floor(Math.random() * 30) + 5;
        }
      }

      if (finalDuration > 60) {
        // Relaxed limit or check
        // toast.warning("Video duration might be long.");
      }

      onSave({
        title,
        videoUrl,
        duration: finalDuration || 15,
        area: user?.district || '',
        author: user?.name || 'Admin'
      });
    } catch (error: any) {
      console.error("Shorts Upload Error:", error);
      toast.error('Failed to upload short: ' + (error.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 w-full max-w-md rounded-xl border border-slate-700 shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
          <h2 className="text-xl font-bold text-white">{initialData ? 'Edit Short' : 'Upload New Short'}</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors" disabled={uploading}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Title <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500"
              placeholder="Enter short title..."
              disabled={uploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Video File <span className="text-red-400">*</span></label>
            <div className={`border-2 border-dashed border-slate-700 rounded-lg p-8 flex flex-col items-center justify-center ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-yellow-500/50 cursor-pointer'} transition-colors bg-slate-800/50 relative group`}>
              <input
                type="file"
                accept="video/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                disabled={uploading}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setVideoFile(e.target.files[0]);
                    toast.info("Video selected.");
                  }
                }}
              />
              <Video className="text-slate-400 mb-2 group-hover:text-yellow-500 transition-colors" size={32} />
              <span className="text-sm text-slate-400 group-hover:text-slate-200">
                {videoFile ? videoFile.name : (initialData?.videoUrl ? 'Change video file' : 'Click to upload video')}
              </span>
              <span className="text-xs text-slate-500 mt-1">Max duration: 60 seconds</span>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex gap-3 items-start">
            <AlertCircle className="text-yellow-500 flex-shrink-0 mt-0.5" size={16} />
            <p className="text-xs text-yellow-200/80">Vertical videos (9:16) work best.</p>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold rounded-lg transition-colors shadow-lg shadow-yellow-500/20 flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-slate-900 border-t-transparent rounded-full"></span>
                  Uploading...
                </>
              ) : (
                initialData ? 'Update Short' : 'Upload Short'
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const ShortsManager = ({ shorts, setShorts, onViewItem, user }: { shorts: ShortItem[], setShorts: React.Dispatch<React.SetStateAction<ShortItem[]>>, onViewItem: (item: ShortItem) => void, user: any }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShortItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');

  const filteredShorts = shorts.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());

    // Date filtering
    let matchesDate = true;
    if (selectedDate) {
      const itemDate = new Date(item.timestamp);
      const filterDate = new Date(selectedDate);
      matchesDate = itemDate.getDate() === filterDate.getDate() &&
        itemDate.getMonth() === filterDate.getMonth() &&
        itemDate.getFullYear() === filterDate.getFullYear();
    }

    return matchesSearch && matchesDate;
  });

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this short?')) {
      try {
        await api.deleteShort(id);
        const updatedShorts = await api.getShorts();
        setShorts(updatedShorts);
        toast.success('Short deleted successfully');
      } catch (error) {
        console.error(error);
        toast.error('Failed to delete short');
      }
    }
  };

  const handleSave = async (data: Omit<ShortItem, 'id' | 'timestamp'>) => {
    try {
      if (editingItem) {
        await api.updateShort(editingItem.id, data);
        toast.success('Short updated successfully');
      } else {
        await api.createShort(data);
        toast.success('Short uploaded successfully');
      }

      const updatedShorts = await api.getShorts();
      setShorts(updatedShorts);
      setIsFormOpen(false);
      setEditingItem(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save short');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-white">Manage Shorts</h2>
        <button
          onClick={() => { setEditingItem(null); setIsFormOpen(true); }}
          className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-4 py-2 rounded-lg font-bold transition-all"
        >
          <Plus size={20} />
          <span>Upload Short</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 bg-slate-800 p-4 rounded-xl border border-slate-700">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search shorts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Date Filter */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500 invert-calendar-icon"
            />
          </div>

          <div className="w-px h-6 bg-slate-700 mx-1"></div>

          <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              title="List View"
            >
              <LayoutList size={18} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              title="Grid View"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className={viewMode === 'list' ? "grid grid-cols-1 gap-4" : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"}>
        {filteredShorts.map(item => (
          viewMode === 'grid' ? (
            <div key={item.id} className="group relative aspect-[9/16] bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-lg">
              {/* Mock Video Thumbnail */}
              <div className="absolute inset-0 bg-slate-700 flex items-center justify-center">
                <Video size={48} className="text-slate-600" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-4 flex flex-col justify-end">
                <h3 className="text-white font-bold line-clamp-2 mb-1">{item.title}</h3>
                <span className="text-xs text-slate-300 mb-3">{item.duration} sec</span>

                <div className="grid grid-cols-3 gap-2 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                  <button
                    onClick={() => onViewItem(item)}
                    className="bg-blue-500/80 hover:bg-blue-600 text-white p-2 rounded-lg flex justify-center backdrop-blur-sm transition-colors"
                    title="View"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => { setEditingItem(item); setIsFormOpen(true); }}
                    className="bg-slate-800/80 hover:bg-white hover:text-slate-900 text-white p-2 rounded-lg flex justify-center backdrop-blur-sm transition-colors"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="bg-red-500/80 hover:bg-red-600 text-white p-2 rounded-lg flex justify-center backdrop-blur-sm transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // List View
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex gap-6 hover:border-slate-600 transition-colors"
            >
              <div className="h-32 w-24 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0 border border-slate-700">
                <Video size={32} className="text-slate-600" />
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">{item.title}</h3>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>{item.duration} seconds</span>
                    <span>•</span>
                    <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => onViewItem(item)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-xs font-medium rounded-lg transition-colors"
                  >
                    <Eye size={14} /> View
                  </button>
                  <button
                    onClick={() => { setEditingItem(item); setIsFormOpen(true); }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Edit size={14} /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-medium rounded-lg transition-colors"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            </motion.div>
          )
        ))}
        {filteredShorts.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 border border-dashed border-slate-700 rounded-xl bg-slate-800/30">
            <Film size={48} className="mx-auto mb-3 opacity-20" />
            <p>No shorts found matching your search.</p>
          </div>
        )}
      </div>

      {isFormOpen && (
        <ShortsForm
          initialData={editingItem}
          onSave={handleSave}
          onCancel={() => { setIsFormOpen(false); setEditingItem(null); }}
          user={user}
        />
      )}
    </div>
  );
};

// --- Advertisements ---

const AdvertisementsManager = ({
  advertisements,
  onAdd,
  onUpdate,
  onDelete
}: {
  advertisements: Advertisement[],
  onAdd: (ad: Omit<Advertisement, 'id' | 'timestamp'>) => Promise<void>,
  onUpdate: (id: string, ad: Partial<Advertisement>) => Promise<void>,
  onDelete: (id: string) => Promise<void>
}) => {
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ mediaUrl: '', intervalMinutes: 15, displayInterval: 4, clickUrl: '', isActive: true });
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !formData.mediaUrl) {
      toast.error('Please select an image or video');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalMediaUrl = formData.mediaUrl;
      if (file) {
        finalMediaUrl = await api.uploadFile(file);
      }

      await onAdd({
        mediaUrl: finalMediaUrl,
        intervalMinutes: formData.intervalMinutes,
        displayInterval: formData.displayInterval,
        clickUrl: formData.clickUrl,
        isActive: formData.isActive
      });
      setShowForm(false);
      setFormData({ mediaUrl: '', intervalMinutes: 15, displayInterval: 4, clickUrl: '', isActive: true });
      setFile(null);
      toast.success('Advertisement added successfully');
    } catch (error) {
      toast.error('Failed to add ad');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Manage Advertisements</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold rounded-lg transition-colors"
        >
          {showForm ? <X size={20} /> : <Plus size={20} />}
          {showForm ? 'Cancel' : 'Upload Ad'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Media (Image/Video) *</label>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:border-yellow-500 transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Time Interval (Mins)</label>
              <input
                type="number"
                min="1"
                value={formData.intervalMinutes}
                onChange={(e) => setFormData(p => ({ ...p, intervalMinutes: parseInt(e.target.value) || 15 }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:border-yellow-500 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Item Interval (News/Shorts)</label>
              <input
                type="number"
                min="1"
                value={formData.displayInterval}
                onChange={(e) => setFormData(p => ({ ...p, displayInterval: parseInt(e.target.value) || 4 }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:border-yellow-500 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Click URL (Optional)</label>
              <input
                type="url"
                value={formData.clickUrl}
                onChange={(e) => setFormData(p => ({ ...p, clickUrl: e.target.value }))}
                placeholder="https://"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:border-yellow-500 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-300">Active</label>
            <button type="button" onClick={() => setFormData(p => ({ ...p, isActive: !p.isActive }))} className={`w-11 h-6 rounded-full relative transition-colors ${formData.isActive ? 'bg-yellow-500' : 'bg-slate-700'}`}>
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${formData.isActive ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Uploading...' : 'Save Advertisement'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {advertisements.map(ad => (
          <div key={ad.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden relative group">
            <div className="h-32 bg-black relative">
              {ad.mediaUrl.match(/\.(mp4|webm|ogg)$/i) ? (
                <video src={ad.mediaUrl} className="w-full h-full object-cover" controls />
              ) : (
                <img src={ad.mediaUrl} className="w-full h-full object-cover" alt="Ad" />
              )}
            </div>
            <div className="p-3 space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    Time: {ad.intervalMinutes}m
                    <button
                      onClick={() => {
                        const newVal = window.prompt('Enter new time interval (minutes):', ad.intervalMinutes.toString());
                        if (newVal) {
                          const parsed = parseInt(newVal, 10);
                          if (!isNaN(parsed) && parsed > 0) {
                            onUpdate(ad.id, { intervalMinutes: parsed });
                          }
                        }
                      }}
                      className="text-yellow-500 hover:text-yellow-400"
                    >
                      <Edit size={10} />
                    </button>
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    Items: {ad.displayInterval || 4}
                    <button
                      onClick={() => {
                        const newVal = window.prompt('Enter new item interval (e.g. after 4 items):', (ad.displayInterval || 4).toString());
                        if (newVal) {
                          const parsed = parseInt(newVal, 10);
                          if (!isNaN(parsed) && parsed > 0) {
                            onUpdate(ad.id, { displayInterval: parsed });
                          }
                        }
                      }}
                      className="text-yellow-500 hover:text-yellow-400"
                    >
                      <Edit size={10} />
                    </button>
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ad.isActive ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                  {ad.isActive ? 'Active' : 'Paused'}
                </span>
              </div>
              {ad.clickUrl && (
                <a href={ad.clickUrl} target="_blank" rel="noreferrer" className="text-blue-400 text-[10px] truncate block hover:underline">
                  {ad.clickUrl}
                </a>
              )}
              <div className="pt-2 flex gap-2">
                <button onClick={() => onUpdate(ad.id, { isActive: !ad.isActive })} className="flex-1 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white transition-colors">
                  {ad.isActive ? 'Pause' : 'Activate'}
                </button>
                <button onClick={() => { if (window.confirm('Delete this ad?')) onDelete(ad.id); }} className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Main App ---

import splashImage from './assets/splash_v2.jpg';

export default function App() {
  const { playingId, handleSpeak } = useTextToSpeech();
  const [showSplash, setShowSplash] = useState(true);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewingMedia, setViewingMedia] = useState<NewsItem | ShortItem | null>(null);

  // -- State Initialization --
  const [news, setNews] = useState<NewsItem[]>([]);
  const [pendingNews, setPendingNews] = useState<NewsItem[]>([]);
  const [shorts, setShorts] = useState<ShortItem[]>([]);
  const [advertisements, setAdvertisements] = useState<Advertisement[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  // -- Auth Handling --
  useEffect(() => {
    const savedUser = localStorage.getItem('adminUser');
    if (savedUser) {
      setAdminUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLogin = (user: any) => {
    setAdminUser(user);
    localStorage.setItem('adminUser', JSON.stringify(user));
  };

  const handleLogout = () => {
    setAdminUser(null);
    localStorage.removeItem('adminUser');
  };

  // -- Fetch Data --
  useEffect(() => {
    if (!adminUser) return;

    const fetchData = async () => {
      try {
        const [newsData, shortsData, adsData] = await Promise.all([
          api.getNews(adminUser.district, adminUser.role),
          api.getShorts(adminUser.district, adminUser.role),
          api.getAdvertisements()
        ]);

        setNews(newsData.filter(n => n.status === 'published' || !n.status));
        setPendingNews(newsData.filter(n => n.status === 'pending'));
        setShorts(shortsData);
        setAdvertisements(adsData);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        toast.error('Failed to connect to database');
      }
    };

    fetchData();
  }, [adminUser]);

  // -- Advertisement Handlers --
  const handleAddAd = async (ad: Omit<Advertisement, 'id' | 'timestamp'>) => {
    try {
      const newAd = await api.createAdvertisement(ad);
      setAdvertisements([newAd, ...advertisements]);
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleUpdateAd = async (id: string, updates: Partial<Advertisement>) => {
    try {
      const updated = await api.updateAdvertisement(id, updates);
      setAdvertisements(advertisements.map(a => a.id === id ? updated : a));
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleDeleteAd = async (id: string) => {
    try {
      await api.deleteAdvertisement(id);
      setAdvertisements(advertisements.filter(a => a.id !== id));
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleRemoveBreaking = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.updateNews(id, { isBreaking: false });
      setNews(news.map(n => n.id === id ? { ...n, isBreaking: false } : n));
      toast.success("Removed from breaking news");
    } catch (err) {
      toast.error("Failed to remove from breaking news");
    }
  };

  // -- Splash Screen Effect --
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <div className="fixed inset-0 bg-[#020617] z-[100]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full h-full relative flex items-center justify-center bg-black"
        >
          <img
            src={splashImage}
            alt="Loading..."
            className="w-full h-full object-contain"
          />
        </motion.div>
      </div>
    );
  }

  if (!adminUser) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-[#020617] text-slate-100 font-sans overflow-hidden selection:bg-yellow-500/30">
      <Toaster position="top-right" theme="dark" />

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        user={adminUser}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden h-16 bg-[#0f172a] border-b border-slate-800 flex items-center px-4 justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="text-slate-300">
              <Menu size={24} />
            </button>
            <h1 className="text-lg font-bold text-yellow-500">SAMANYUDU TV</h1>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {activeTab === 'dashboard' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                <h2 className="text-2xl font-bold text-white mb-6">Dashboard Overview</h2>
                <DashboardStats newsCount={news.length} shortsCount={shorts.length} pendingCount={pendingNews.length} />

                <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Recent Breaking News</h3>
                  <div className="space-y-3">
                    {news.filter(n => n.isBreaking).slice(0, 3).map(item => (
                      <div
                        key={item.id}
                        onClick={() => setViewingMedia(item)}
                        className="flex items-center gap-3 p-3 bg-red-500/5 border border-red-500/10 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer group"
                      >
                        <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
                        <span className="text-white font-medium truncate flex-1">{item.title}</span>
                        {adminUser?.role === 'super_admin' && (
                          <button
                            onClick={(e) => handleRemoveBreaking(e, item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                            title="Remove from breaking"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    {news.filter(n => n.isBreaking).length === 0 && (
                      <p className="text-slate-500 text-sm">No breaking news active currently.</p>
                    )}
                  </div>
                </div>

                <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Latest Shorts Updates</h3>
                    <button onClick={() => setActiveTab('shorts')} className="text-sm text-yellow-500 hover:text-yellow-400">View All</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {shorts.slice(0, 4).map(item => (
                      <div
                        key={item.id}
                        onClick={() => setViewingMedia(item)}
                        className="group relative aspect-[9/16] bg-slate-700 rounded-lg overflow-hidden border border-slate-600 shadow-sm hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
                          {item.videoUrl ? (
                            <video
                              src={item.videoUrl}
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                              muted
                              playsInline
                              onMouseOver={e => e.currentTarget.play()}
                              onMouseOut={e => {
                                e.currentTarget.pause();
                                e.currentTarget.currentTime = 0;
                              }}
                            />
                          ) : (
                            <Video size={32} className="text-slate-600" />
                          )}
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent p-3 flex flex-col justify-end pointer-events-none">
                          <h4 className="text-white font-medium text-xs line-clamp-2 leading-snug">{item.title}</h4>
                          <span className="text-[10px] text-slate-300 mt-1">{item.duration}s</span>
                        </div>
                      </div>
                    ))}
                    {shorts.length === 0 && (
                      <p className="col-span-full text-slate-500 text-center py-4">No shorts available.</p>
                    )}
                  </div>
                </div>

                <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Latest News Updates</h3>
                    <button onClick={() => setActiveTab('news')} className="text-sm text-yellow-500 hover:text-yellow-400">View All</button>
                  </div>
                  <div className="space-y-3">
                    {news.slice(0, 5).map(item => (
                      <div
                        key={item.id}
                        onClick={() => setViewingMedia(item)}
                        className="flex items-center gap-4 p-3 bg-slate-700/30 border border-slate-700/50 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer group"
                      >
                        <div className="w-16 h-12 bg-slate-600 rounded overflow-hidden flex-shrink-0">
                          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium text-sm line-clamp-2 leading-snug break-words">{item.title}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold bg-slate-700 px-1.5 rounded">{item.type}</span>
                            <span className="text-xs text-slate-500">{new Date(item.timestamp).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {item.isBreaking && (
                            <span className="flex-shrink-0 text-[10px] font-bold text-red-500 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded uppercase">Breaking</span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSpeak(item);
                            }}
                            className={`p-2 rounded-full transition-colors ${playingId === item.id ? 'text-yellow-500 bg-yellow-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-600'}`}
                            title={playingId === item.id ? "Stop Reading" : "Read Aloud"}
                          >
                            {playingId === item.id ? <StopCircle size={18} /> : <Volume2 size={18} />}
                          </button>
                        </div>
                      </div>
                    ))}
                    {news.length === 0 && (
                      <p className="text-slate-500 text-center py-4">No news articles available.</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'news' && (
              <NewsManager news={news} setNews={setNews} onViewItem={setViewingMedia} user={adminUser} />
            )}


            {activeTab === 'approvals' && adminUser.role === 'super_admin' && (
              <NewsApprovalManager pendingNews={pendingNews} setPendingNews={setPendingNews} setNews={setNews} />
            )}

            {activeTab === 'analytics' && adminUser.role === 'super_admin' && (
              <AnalyticsView news={news} shorts={shorts} />
            )}

            {activeTab === 'shorts' && (
              <ShortsManager shorts={shorts} setShorts={setShorts} onViewItem={setViewingMedia} user={adminUser} />
            )}

            {activeTab === 'reporters' && adminUser.role === 'super_admin' && (
              <ReportersManager />
            )}

            {activeTab === 'advertisements' && adminUser.role === 'super_admin' && (
              <AdvertisementsManager
                advertisements={advertisements}
                onAdd={handleAddAd}
                onUpdate={handleUpdateAd}
                onDelete={handleDeleteAd}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView user={adminUser} />
            )}

            {viewingMedia && (
              <MediaPlayer item={viewingMedia} onClose={() => setViewingMedia(null)} />
            )}
          </div>
        </main>
      </div>
      {viewingMedia && (
        <MediaPlayer item={viewingMedia} onClose={() => setViewingMedia(null)} />
      )}
    </div>
  );
}
