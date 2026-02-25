import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  List,
  Users,
  Send,
  Calendar,
  FileText,
  Settings,
  Briefcase,
  Info,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: List, label: 'LAMP List', path: '/lamp' },
  { icon: Users, label: 'Contacts', path: '/contacts' },
  { icon: Send, label: 'Outreach', path: '/outreach' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: FileText, label: 'Templates', path: '/templates' },
  { icon: Info, label: 'About', path: '/about' },
];

const adminItems = [
  { icon: Shield, label: 'Admin', path: '/admin' },
];

export default function Sidebar() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg">2HJS Tracker</h1>
            <p className="text-xs text-muted-foreground">Job Search Manager</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              </li>
            );
          })}

          {/* Admin section */}
          {isAdmin && (
            <li className="pt-4 mt-4 border-t border-border">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                Admin
              </div>
              {adminItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </li>
          )}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <Link to="/settings" className="block">
          <div className="bg-muted rounded-lg p-4 hover:bg-muted/80 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-4 h-4" />
              <h3 className="font-semibold text-sm">Settings</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Manage your account and encryption keys
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
