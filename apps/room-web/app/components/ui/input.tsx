import * as React from 'react';
import { cn } from '~/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full rounded-[10px] border border-line bg-washi px-3 text-sm text-ink outline-none',
        'focus:border-moss',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
