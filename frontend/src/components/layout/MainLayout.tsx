import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex h-screen bg-background flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
      {/* Legal Disclaimer Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 px-6 py-2 text-xs text-gray-500 text-center">
        This application is inspired by concepts from &quot;The 2-Hour Job Search&quot; by Steve Dalton.
        This is an independent implementation and is not affiliated with, endorsed by, or sponsored by the author or publisher.
      </footer>
    </div>
  );
}
