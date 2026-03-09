import Sidebar from '@/components/Sidebar';
import { ChatAgent } from '@/components/chat-agent';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-slate-50 flex">
            <Sidebar />
            <main className="flex-1 lg:ml-64 p-4 lg:p-8 relative">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
                <ChatAgent />
            </main>
        </div>
    );
}
