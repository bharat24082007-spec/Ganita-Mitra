// Small inline-SVG icons. Stroke-based, drawn in currentColor so the parent's text colour sets them.
// Each takes a className (default size 24px); no image files are used.

// Builds an icon component from its SVG children.
const icon = (children) =>
  function Icon({ className = 'w-6 h-6' }) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };

// Open book (Lesson tab)
export const BookIcon = icon(
  <>
    <path d="M2 5c3-1.5 6-1.5 10 1 4-2.5 7-2.5 10-1v13c-3-1-6-1-10 1-4-2-7-2-10-1z" />
    <path d="M12 6v13" />
  </>
);

// Pencil (Practice tab)
export const PencilIcon = icon(<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />);

// Bar chart with a rising line (Progress tab)
export const ChartIcon = icon(
  <>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 3 3 5-6" />
  </>
);

// Flame (streak)
export const FlameIcon = icon(
  <path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-11-2 2-3 4-3 6-1-1-2-2-2-4-2 2-4 5-4 9a7 7 0 0 0 6 7z" />
);

// Two arrows swapping (Switch profile)
export const SwitchIcon = icon(
  <>
    <path d="M4 8h13l-3-3" />
    <path d="M20 16H7l3 3" />
  </>
);

// Globe (language)
export const GlobeIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z" />
  </>
);

// Paper plane (send)
export const SendIcon = icon(
  <>
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4z" />
  </>
);

// Microphone (speak)
export const MicIcon = icon(
  <>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <path d="M12 17v4" />
  </>
);

// Friendly teacher face above an open book (Mitra Teacher)
export const TeacherIcon = icon(
  <>
    <circle cx="12" cy="8" r="5" />
    <path d="M9.5 9.5a3.5 3.5 0 0 0 5 0" />
    <path d="M9.5 6.5h.01M14.5 6.5h.01" />
    <path d="M3 21c2-1.5 4-1.5 9 0 5-1.5 7-1.5 9 0v-6c-2-1.5-4-1.5-9 0-5-1.5-7-1.5-9 0z" />
    <path d="M12 15v6" />
  </>
);

// Tick (correct)
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />);

// Cross (wrong / close)
export const XIcon = icon(<path d="M6 6l12 12M18 6L6 18" />);

// Left arrow (back)
export const BackIcon = icon(
  <>
    <path d="M19 12H5" />
    <path d="M11 6l-6 6 6 6" />
  </>
);
