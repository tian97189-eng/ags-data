import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import Toast from '../common/Toast';

export default function Layout() {
  return (
    <div className="flex h-full">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 pb-16 md:pb-4">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <Toast />
    </div>
  );
}
