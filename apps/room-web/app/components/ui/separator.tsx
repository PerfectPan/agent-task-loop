"use client"

/*
 * Stock shadcn new-york, with every DOM wrapper converted to React.forwardRef:
 * this repo is on React 18 and the registry now emits React 19 components that
 * take `ref` as a plain prop, which React 18 drops with a warning.
 */
import * as React from "react"
import { cn } from "~/lib/utils"
import { Separator as SeparatorPrimitive } from "radix-ui"

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentProps<typeof SeparatorPrimitive.Root>
>(function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}, ref) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className
      )}
      {...props}
    />
  )
})

export { Separator }
