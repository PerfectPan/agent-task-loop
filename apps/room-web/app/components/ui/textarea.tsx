import * as React from "react"
import { cn } from "~/lib/utils"

/* Stock shadcn new-york at 宣纸's control scale: 4px radius, flat, resizes down
   the vertical only. The composer's own textarea is not this component — it is
   transparent and the card around it is the field. */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full resize-y rounded-sm border border-input bg-transparent px-2 py-1.5 text-sm leading-relaxed transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
})

export { Textarea }
