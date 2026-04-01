import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Samadhan Setu - AI Grievance Redressal',
  description: 'AI-powered platform bridging citizens and government for efficient grievance resolution',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)] antialiased tracking-tight selection:bg-[var(--foreground)] selection:text-[var(--background)]">
        <ThemeProvider>
          <AuthProvider>
            <div className="relative flex flex-col min-h-screen">
              {/* Optional Subtle Background Noise/Mesh for extra polish - very low opacity */}
              <div aria-hidden="true" className="fixed inset-0 pointer-events-none z-[-1] opacity-30 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] dark:opacity-5 mix-blend-overlay"></div>
              
              {/* Sticky Container for floating pill navbar */}
              <div className="sticky top-0 z-50 pt-4 pb-2 px-4 md:px-8 max-w-[1400px] mx-auto w-full">
                <Navbar />
              </div>
              
              {/* Main App Content body */}
              <main className="flex-grow flex flex-col w-full max-w-[1400px] mx-auto pt-6 px-4 md:px-8 pb-16">
                {children}
              </main>
              
              <Footer />
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
