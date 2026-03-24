export const SquareIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6v12h-12" />
        <path d="M15 6v9h-9" />
    </svg>
);

export const LevelIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4L4 18h16L12 4z" />
        <path d="M12 8v6" />
        <path d="M9 14h6" />
    </svg>
);

export const PlumbIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="M8 3h8" />
        <circle cx="12" cy="18" r="3" />
    </svg>
);

export const CrossedKeysIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 10l6-6m-2 2l2 2m-4-0l2 2m-6-6l-2-2a2.828 2.828 0 10-4 4l2 2" />
        <path d="M10 14l-6 6m2-2l-2-2m4 0l-2-2m6 6l2 2a2.828 2.828 0 104-4l-2-2" />
    </svg>
);

export const CrossedQuillsIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 5l-8 8m-2 4c-1.5 1.5-3 2-4 2s0-2.5 1.5-4L11 9" />
        <path d="M5 5l8 8m2 4c1.5 1.5 3 2 4 2s0-2.5-1.5-4L13 9" />
    </svg>
);

export const SunCompassesIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 7l-5 13 M12 7l5 13 M9.5 13.5h5" />
        <circle cx="12" cy="9" r="2" />
        <path d="M12 5v-2 M12 13v2 M9 9h-2 M17 9h2 M10 6l-1-1 M15 12l1 1 M10 12l-1 1 M15 6l1-1" />
    </svg>
);

export const MoonCompassesIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 7l-5 13 M12 7l5 13 M9.5 13.5h5" />
        <path d="M13.5 10.5A3 3 0 1010.5 7v0a4.5 4.5 0 013 3.5z" />
    </svg>
);

export const SwordIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21L12 6" />
        <path d="M8 6h8" />
        <path d="M12 6l-1-4h2z" />
    </svg>
);

export const BookIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2h13v15H6.5a2.5 2.5 0 000 5H20" />
        <path d="M10 5v6 M8 8h4" />
    </svg>
);

export const GroupIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
);

// Helper mapping for role/office to the image URL
export const getRoleImageUrl = (roleName: string): string | null => {
    const r = roleName.toUpperCase();
    if (r.includes("WM") || r.includes("MASTER")) return "/role-icons/wm.png";
    if (r.includes("SW") || r.includes("SENIOR WARDEN")) return "/role-icons/sw.png";
    if (r.includes("JW") || r.includes("JUNIOR WARDEN")) return "/role-icons/jw.png";
    if (r.includes("TR") || r.includes("TREASURER")) return "/role-icons/tr.png";
    if (r.includes("SEC")) return "/role-icons/sec.png";
    if (r.includes("SD") || r.includes("SENIOR DEACON")) return "/role-icons/sd.png";
    if (r.includes("JD") || r.includes("JUNIOR DEACON")) return "/role-icons/jd.png";
    if (r.includes("TY") || r.includes("TYLER") || r.includes("IG") || r.includes("VCHR")) return "/role-icons/ty.png";
    if (r.includes("PRAYER") || r.includes("CHAP")) return "/role-icons/chap.png";
    if (r.includes("ALL")) return "/role-icons/all.png";

    return null; // Fallback to none if unknown
};

// Replaces the previous SVG mapping with a dynamic Image component mapping
export const getRoleIcon = (roleName: string) => {
    const url = getRoleImageUrl(roleName);
    if (!url) return null;

    return function RoleImageIcon({ className }: { className?: string }) {
        // Merge the optional className with styling for the image (round, object-cover)
        return <img src={url} alt={`${roleName} icon`} className={`object-cover rounded-full shadow-lg border border-amber-500/20 ${className || ''}`} />;
    };
};
