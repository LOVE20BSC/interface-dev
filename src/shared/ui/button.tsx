import { Loader2 } from '@/shared/ui/icons';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export type ButtonVariant =
  'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-on-brand shadow-soft hover:bg-brand-strong active:bg-brand-strong disabled:bg-brand/60',
  secondary:
    'border border-line bg-surface text-foreground hover:bg-elevated active:bg-elevated-hover',
  ghost: 'text-foreground hover:bg-elevated active:bg-line-strong',
  danger: 'bg-danger text-on-brand hover:bg-danger/90 active:bg-danger/80',
  // Red border + red text on a transparent background; geometry stays in SIZES.
  'danger-outline':
    'border border-danger bg-transparent text-danger-strong hover:bg-danger-soft/60 active:bg-danger-soft',
  outline:
    'border border-brand/30 bg-brand-soft/40 text-brand-strong hover:bg-brand-soft active:bg-brand-soft',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 rounded-xl px-3 text-sm',
  md: 'h-11 gap-2 rounded-2xl px-4 text-sm',
  lg: 'h-12 gap-2 rounded-2xl px-5 text-base',
  icon: 'h-11 w-11 rounded-2xl',
};

export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex select-none items-center justify-center font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-60',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly leadingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leadingIcon,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={buttonStyles(variant, size, className)}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : leadingIcon}
      {children}
    </button>
  );
});
