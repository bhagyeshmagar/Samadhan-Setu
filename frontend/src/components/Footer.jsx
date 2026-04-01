export default function Footer() {
    return (
        <footer className="footer-theme mt-auto border-t border-theme">
            <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row justify-between items-start gap-12">
                <div className="max-w-sm">
                    <div className="flex items-center gap-3 mb-4 opacity-80 cursor-default">
                        <div className="w-6 h-6 bg-black dark:bg-white rounded-md flex items-center justify-center text-white dark:text-black font-bold text-[10px] shadow-sm">
                            SS
                        </div>
                        <h4 className="font-bold text-sm tracking-widest uppercase text-theme">Samadhan</h4>
                    </div>
                    <p className="text-theme-muted text-xs leading-relaxed max-w-[250px]">
                        AI infrastructure bridging the gap between citizens and administration 
                        for frictionless grievance resolution.
                    </p>
                </div>

                <div className="flex gap-16 md:gap-24">
                    <div>
                        <h4 className="font-bold text-[10px] uppercase tracking-wider mb-4 text-theme-secondary">Platform</h4>
                        <ul className="space-y-3 text-theme-muted text-xs">
                            <li className="hover:text-theme cursor-pointer transition-colors duration-200">System Architecture</li>
                            <li className="hover:text-theme cursor-pointer transition-colors duration-200">Data Guidelines</li>
                            <li className="hover:text-theme cursor-pointer transition-colors duration-200">Security</li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-bold text-[10px] uppercase tracking-wider mb-4 text-theme-secondary">Legal</h4>
                        <ul className="space-y-3 text-theme-muted text-xs">
                            <li className="hover:text-theme cursor-pointer transition-colors duration-200">Privacy Policy</li>
                            <li className="hover:text-theme cursor-pointer transition-colors duration-200">Terms of Service</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="text-center text-[10px] tracking-wide text-theme-muted py-6 border-t border-theme opacity-60">
                © {new Date().getFullYear()} SAMADHAN SETU. ALL RIGHTS RESERVED.
            </div>
        </footer>
    );
}
