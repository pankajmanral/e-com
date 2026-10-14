import clsx, { type ClassValue } from 'clsx';
import { forwardRef, type SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hideLabel?: boolean;
  containerClassName?: ClassValue;
}

/**
 * Styled native <select> — accessible and keyboard-friendly by default.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hideLabel, containerClassName, className, id, children, ...rest },
  ref,
) {
  const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className={clsx('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label
          htmlFor={selectId}
          className={clsx(
            'text-sm font-medium text-navy-800',
            hideLabel && 'sr-only',
          )}
        >
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={clsx(
          'h-10 w-full appearance-none rounded-lg border border-navy-200 bg-white px-3 pr-8 text-sm text-navy-800',
          'bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%231b3668%27%20stroke-width%3D%272%27%3E%3Cpath%20d%3D%27M6%209l6%206%206-6%27%2F%3E%3C%2Fsvg%3E")] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat',
          'hover:border-navy-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
});
