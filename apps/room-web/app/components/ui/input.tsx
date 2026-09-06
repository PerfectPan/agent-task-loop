import * as React from 'react';
import { cn } from '~/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full rounded-[10px] border border-line bg-washi px-3 text-sm text-ink',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hydrangea',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
