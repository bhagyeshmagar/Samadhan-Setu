import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Samadhan Setu | AI Grievance Redressal Portal',
  description: 'Samadhan Setu — An AI-powered government grievance redressal platform. File, track and resolve civic issues transparently. समाधान सेतु — नागरिक शिकायत निवारण पोर्टल।',
  keywords: 'grievance, redressal, government portal, complaint, civic, India, AI, samadhan setu',
  authors: [{ name: 'Samadhan Setu' }],
  openGraph: {
    title: 'Samadhan Setu | AI Grievance Redressal Portal',
    description: 'File and track civic grievances with AI-powered routing and resolution.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Accessibility: skip to main content */}
        <style>{`
          .skip-link {
            position: absolute;
            top: -100%;
            left: 0;
            background: #003580;
            color: white;
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
            font-weight: 600;
            z-index: 9999;
            text-decoration: none;
            border-radius: 0 0 8px 0;
          }
          .skip-link:focus { top: 0; }
        `}</style>
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ThemeProvider>
          <AuthProvider>
            <div className="relative flex flex-col min-h-screen" style={{ background: 'var(--bg-page)' }}>

              {/* Sticky Header */}
              <div className="sticky top-0 z-50 w-full" style={{ background: 'var(--bg-header)', borderBottom: '1px solid var(--nav-border)', boxShadow: 'var(--shadow-xs)' }}>
                <Navbar />
              </div>

              {/* Main Content */}
              <main
                id="main-content"
                className="flex-grow flex flex-col w-full max-w-[1400px] mx-auto px-4 md:px-8 pt-6 pb-16"
              >
                {children}
              </main>

              {/* Footer */}
              <Footer />
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
