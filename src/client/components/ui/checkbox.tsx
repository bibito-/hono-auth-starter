import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@client/lib/utils"
import { CheckIcon } from "lucide-react"

const checkboxVariants = cva(
  "peer relative flex shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:text-primary-foreground dark:data-checked:bg-primary",
  {
    variants: {
      size: {
        default: "size-4",
        lg: "size-6",
      },
      color: {
        default: "data-checked:border-primary data-checked:bg-primary",
        primary: "data-checked:bg-blue-500 data-checked:border-blue-500",
        danger: "data-checked:bg-red-500 data-checked:border-red-500",
      }
    },
    defaultVariants: {
      size: "default",
      color: "default",
    },
  }
)

const indicatorVariants = cva(
  "grid place-content-center text-current transition-none",
  {
    variants: {
      size: {
        default: "[&>svg]:size-3.5",
        lg: "[&>svg]:size-5",
      },
      color: {
        default: "[&>svg]:text-white",
        primary: "[&>svg]:text-white",
        danger: "[&>svg]:text-yellow-300",
      }
    },
    defaultVariants: {
      size: "default",
      color: "default",
    },
  }
)

function Checkbox({
  className,
  size,
  color,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> &
  VariantProps<typeof checkboxVariants>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(checkboxVariants({ size, color }), className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={indicatorVariants({ size, color })}
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
