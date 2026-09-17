import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "~/lib/utils"
import { Slot } from "radix-ui"

/*
 * Stock shadcn new-york with a 4px radius instead of a pill, plus the four
 * state variants this surface needs. Each one is a wash token paired with its
 * own ink, exactly as shadcn pairs --destructive with --destructive-foreground:
 * the state's whole appearance is one variant name, and no caller mixes a
 * neutral ink onto a state wash. `muted` is the neutral chip; it takes --accent
 * rather than --muted so it stays visible on the rails, whose fill is --muted.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        muted: "bg-accent text-muted-foreground",
        destructive:
          "bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90",
        "destructive-soft": "bg-destructive-soft text-destructive-soft-foreground",
        info: "bg-info text-info-foreground",
        warning: "bg-warning text-warning-foreground",
        success: "bg-success text-success-foreground",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Badge = React.forwardRef<
  HTMLSpanElement,
  React.ComponentProps<"span"> &
    VariantProps<typeof badgeVariants> & { asChild?: boolean }
>(function Badge({ className, variant = "default", asChild = false, ...props }, ref) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      ref={ref}
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
})

export { Badge, badgeVariants }
