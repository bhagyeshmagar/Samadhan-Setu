import { Mail, Github } from 'lucide-react';

export default function Footer() {
    return (
        <footer className="footer-theme pt-10 pb-4 text-sm mt-auto">
            <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <div>
                    <h4 className="font-bold text-lg mb-4 text-theme">Samadhan Setu</h4>
                    <p className="text-theme-muted text-xs leading-relaxed">
                        An AI-powered platform bridging the gap between citizens and administration
                        for transparent and efficient grievance resolution.
                    </p>
                </div>

                <div>
                    <h4 className="font-bold mb-4 text-theme-secondary">Quick Links</h4>
                    <ul className="space-y-2 text-theme-muted text-xs">
                        <li className="hover:text-theme cursor-pointer transition">About Us</li>
                        <li className="hover:text-theme cursor-pointer transition">How It Works</li>
                        <li className="hover:text-theme cursor-pointer transition">Privacy Policy</li>
                        <li className="hover:text-theme cursor-pointer transition">Terms of Service</li>
                    </ul>
                </div>

                <div>
                    <h4 className="font-bold mb-4 text-theme-secondary">Accessibility</h4>
                    <div className="flex gap-2 text-xs text-theme-muted flex-wrap">
                        <span className="border border-theme px-2 py-1 rounded hover:bg-theme-tertiary cursor-pointer transition">
                            Screen Reader
                        </span>
                        <span className="border border-theme px-2 py-1 rounded hover:bg-theme-tertiary cursor-pointer transition">
                            High Contrast
                        </span>
                    </div>
                </div>
            </div>

            <div className="text-center text-xs text-theme-muted border-t border-theme pt-4">
                © {new Date().getFullYear()} Samadhan Setu. All rights reserved.
            </div>
        </footer>
    );
}
