import * as React from 'react';
import { cn } from '~/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-16 w-full rounded-[10px] border border-line bg-washi px-3 py-2 text-sm text-ink',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hydrangea',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
