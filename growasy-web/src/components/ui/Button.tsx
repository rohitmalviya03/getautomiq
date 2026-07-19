import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'brand-gradient text-white shadow-glow hover:shadow-glow-lg hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 disabled:opacity-60 disabled:shadow-none disabled:translate-y-0',
  secondary:
    'bg-white/80 text-slate-700 border border-slate-200 backdrop-blur hover:bg-white hover:border-brand-300 hover:-translate-y-0.5 dark:bg-white/5 dark:text-slate-200 dark:border-white/10 dark:hover:bg-white/10',
  ghost:
    'bg-transparent text-slate-600 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-300 dark:hover:bg-white/5',
  danger:
    'bg-red-600 text-white shadow-glow hover:bg-red-700 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', isLoading, className = '', children, disabled, ...rest },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`focus-ring inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...rest}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
