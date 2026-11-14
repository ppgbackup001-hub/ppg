import { useState, type ComponentProps, type InputHTMLAttributes } from 'react';

export const Surface = ({
  inset = false,
  className = '',
  ...props
}: ComponentProps<'div'> & { inset?: boolean }) => (
  <div
    className={`min-w-0 [:where(&)]:rounded-card [:where(&)]:text-foreground ${
      inset
        ? '[:where(&)]:bg-background [:where(&)]:border [:where(&)]:border-border/70'
        : '[:where(&)]:bg-surface [:where(&)]:shadow-surface'
    } ${className}`}
    {...props}
  />
);

const buttonTones = {
  primary: '[:where(&)]:bg-primary [:where(&)]:text-primary-foreground',
  ink: '[:where(&)]:bg-foreground [:where(&)]:text-surface',
  quiet:
    '[:where(&)]:border [:where(&)]:border-border [:where(&)]:bg-surface [:where(&)]:text-foreground',
  ghost: '[:where(&)]:bg-transparent [:where(&)]:text-foreground hover:[:where(&)]:bg-foreground/5',
  danger:
    '[:where(&)]:border [:where(&)]:border-red-500/35 [:where(&)]:bg-surface [:where(&)]:text-red-700 dark:[:where(&)]:text-red-400',
};

export const Button = ({
  tone = 'primary',
  type = 'button',
  className = '',
  ...props
}: ComponentProps<'button'> & { tone?: keyof typeof buttonTones }) => (
  <button
    type={type}
    className={`[:where(&)]:inline-flex [:where(&)]:min-h-11 [:where(&)]:items-center [:where(&)]:justify-center [:where(&)]:gap-2 whitespace-nowrap [:where(&)]:rounded-control [:where(&)]:px-4 [:where(&)]:text-sm [:where(&)]:font-medium transition-colors duration-150 ease-out hover:brightness-95 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-45 disabled:pointer-events-none cursor-pointer ${buttonTones[tone]} ${className}`}
    {...props}
  />
);

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Field = ({ label, id, error, className = '', ...props }: FieldProps) => {
  const inputId = id || `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className="block text-xs font-medium text-muted mb-1.5">
        {label}
      </label>
      <input
        id={inputId}
        className={`w-full min-h-11 px-3.5 text-sm rounded-control bg-background text-foreground border border-border/80 placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary transition-colors duration-150 ${className}`}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-xs text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

// Warm studio-grounded sleeve palettes (no purple/neon)
const SLEEVE_PALETTES = [
  { bg: '#EFEAE1', fg: '#262320', accent: '#C8522E' }, // Warm paper & vermilion
  { bg: '#E3EAE5', fg: '#1D2923', accent: '#3D6B58' }, // Celadon & pine
  { bg: '#E6E9EE', fg: '#1F2630', accent: '#3A5A80' }, // Slate paper & cobalt
  { bg: '#EDE4D7', fg: '#2E2318', accent: '#A86224' }, // Ochre & espresso
  { bg: '#272522', fg: '#F1EDE6', accent: '#D96B43' }, // Charcoal vinyl & copper
  { bg: '#1F2726', fg: '#E8EEEB', accent: '#629E87' }, // Deep teal & sage
  { bg: '#2B2420', fg: '#F2E9E1', accent: '#C9893B' }, // Walnut & brass
];

export function TrackCover({
  src,
  seed,
  title,
  sizeClass = 'w-10 h-10',
  roundedClass = 'rounded-lg',
  spinning = false,
}: {
  src?: string;
  seed: number;
  title: string;
  sizeClass?: string;
  roundedClass?: string;
  spinning?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        alt={`ปกอัลบั้ม ${title}`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${sizeClass} ${roundedClass} object-cover shrink-0 bg-background ${
          spinning ? 'animate-vinyl' : ''
        }`}
      />
    );
  }

  const palette = SLEEVE_PALETTES[seed % SLEEVE_PALETTES.length];
  const patternType = seed % 4;
  const cx = 20 + (seed % 20);
  const cy = 20 + ((seed >> 3) % 20);

  return (
    <div
      className={`${sizeClass} ${roundedClass} shrink-0 overflow-hidden select-none ${
        spinning ? 'animate-vinyl' : ''
      }`}
      aria-label={`ปกอัลบั้ม ${title}`}
    >
      <svg viewBox="0 0 64 64" className="w-full h-full block" role="img" aria-label={title}>
        <rect width="64" height="64" fill={palette.bg} />
        {patternType === 0 && (
          <>
            <circle cx="32" cy="32" r="20" fill="none" stroke={palette.fg} strokeWidth="1.5" opacity="0.24" />
            <circle cx="32" cy="32" r="11" fill={palette.accent} />
            <circle cx="32" cy="32" r="3" fill={palette.bg} />
          </>
        )}
        {patternType === 1 && (
          <>
            <rect x="10" y="10" width="44" height="44" fill="none" stroke={palette.fg} strokeWidth="1.5" opacity="0.22" />
            <circle cx={cx} cy={cy} r="14" fill={palette.accent} opacity="0.9" />
            <line x1="10" y1="48" x2="54" y2="48" stroke={palette.fg} strokeWidth="2" opacity="0.55" />
          </>
        )}
        {patternType === 2 && (
          <>
            <path d="M0 44 Q32 22 64 44 L64 64 L0 64 Z" fill={palette.fg} opacity="0.14" />
            <circle cx="44" cy="22" r="10" fill={palette.accent} />
            <circle cx="24" cy="36" r="16" fill="none" stroke={palette.fg} strokeWidth="1.5" opacity="0.35" />
          </>
        )}
        {patternType === 3 && (
          <>
            <line x1="12" y1="16" x2="52" y2="16" stroke={palette.fg} strokeWidth="2" opacity="0.22" />
            <line x1="12" y1="24" x2="52" y2="24" stroke={palette.fg} strokeWidth="2" opacity="0.22" />
            <line x1="12" y1="32" x2="52" y2="32" stroke={palette.fg} strokeWidth="2" opacity="0.22" />
            <rect x="14" y="38" width="20" height="12" rx="2" fill={palette.accent} />
          </>
        )}
      </svg>
    </div>
  );
}
