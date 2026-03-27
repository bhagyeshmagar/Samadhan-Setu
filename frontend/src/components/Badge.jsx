export default function Badge({ status, size = 'default' }) {
    // Normalize status - handle both uppercase (from backend) and title case
    const normalizeStatus = (s) => {
        if (!s) return 'Pending';
        const statusStr = String(s).toLowerCase().replace(/_/g, ' ');
        return statusStr.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const displayStatus = normalizeStatus(status);

    const colors = {
        'Pending': { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-200 dark:border-red-800', text: '#991b1b', darkText: 'text-red-300' },
        'In Progress': { bg: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-200 dark:border-yellow-800', text: '#854d0e', darkText: 'text-yellow-300' },
        'Assigned': { bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-200 dark:border-blue-800', text: '#1e40af', darkText: 'text-blue-300' },
        'Resolved': { bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-200 dark:border-green-800', text: '#166534', darkText: 'text-green-300' },
        'Rejected': { bg: 'bg-gray-100 dark:bg-gray-700', border: 'border-gray-200 dark:border-gray-600', text: '#1f2937', darkText: 'text-gray-300' },
        'Closed': { bg: 'bg-gray-100 dark:bg-gray-700', border: 'border-gray-200 dark:border-gray-600', text: '#4b5563', darkText: 'text-gray-400' },
        'High': { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', text: '#b91c1c', darkText: 'text-red-400' },
        'Medium': { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', text: '#c2410c', darkText: 'text-orange-400' },
        'Low': { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', text: '#1d4ed8', darkText: 'text-blue-400' },
    };

    const config = colors[displayStatus] || colors['Pending'];

    const sizeClasses = {
        small: 'px-1.5 py-0.5 text-[10px]',
        default: 'px-2 py-1 text-xs',
        large: 'px-3 py-1.5 text-sm',
    };

    return (
        <span
            className={`
        rounded-full font-medium border inline-block
        ${config.bg} ${config.border} dark:${config.darkText}
        ${sizeClasses[size]}
      `}
            style={{ color: 'var(--tw-text-opacity)' ? undefined : config.text }} // Fallback if needed, but easier to just use the class for dark mode and style for light
        >
            {/* We will use a style tag to force color in light mode only, assuming dark mode class handles the rest via CSS variables or we can just apply the color directly and let dark mode override via class if we are careful. 
               But simpler: apply the text class for dark mode in className. For light mode, apply color via style. 
               However, inline style for color overrides all classes usually. 
               So we need to only apply the inline color if NOT in dark mode? 
               We can't easily detect dark mode in JS without context or checking DOM class.
               
               Better approach: Use a CSS variable for the text color that we define in a style tag, and let dark mode override it? 
               Or actually, just use the standard classes again but ensure they work. 
               
               Wait, the previous attempt failed because arbitrary values didn't work.
               Let's try standard classes but 'text-red-900' etc. which are VERY dark.
               AND use !important via Tailwind syntax if possible, or just standard classes.
               
               Let's go back to standard classes but simpler ones, and maybe add 'font-bold' to help visibility.
               
               Actually, the user said "still not resolved ig". This implies my previous change didn't take.
               I will change the STRATEGY.
               I will defining the light mode color using a custom style object but conditional on it being light mode? No.
               
               I will use the `active` trick or just separate classes.
            */}
            <span className="dark:hidden" style={{ color: config.text, fontWeight: 'bold' }}>{displayStatus}</span>
            <span className="hidden dark:inline">{displayStatus}</span>
        </span>
    );
}
