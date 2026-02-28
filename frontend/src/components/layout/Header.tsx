import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { outreachApi } from '@/lib/api';

export default function Header() {
  const { data: reminders } = useQuery({
    queryKey: ['reminders'],
    queryFn: outreachApi.getToday,
    refetchInterval: 60000, // Refresh every minute
  });

  const actionCount = reminders?.summary.totalActionRequired || 0;

  return (
    <header className="h-16 bg-card border-b border-border px-6 flex items-center justify-between">
      {/* Page title area - can be customized per page */}
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold">Welcome back!</h2>
        {actionCount > 0 && (
          <span className="bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1 rounded-full">
            {actionCount} action{actionCount !== 1 ? 's' : ''} needed
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
          <Bell className="w-5 h-5 text-muted-foreground" />
          {actionCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
          )}
        </button>
      </div>
    </header>
  );
}
