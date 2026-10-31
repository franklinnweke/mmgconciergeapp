// shadcn/ui (MIT), new-york registry; utilities prefixed for this workspace.
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/features/web/utils";

const buttonVariants = cva(
  "web:inline-flex web:items-center web:justify-center web:gap-2 web:whitespace-nowrap web:rounded-md web:text-sm web:font-medium web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-1 web:focus-visible:ring-ring web:disabled:pointer-events-none web:disabled:opacity-50 web:[&_svg]:pointer-events-none web:[&_svg]:size-4 web:[&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "web:bg-primary web:text-primary-foreground web:shadow web:hover:bg-primary/90",
        destructive:
          "web:bg-destructive web:text-destructive-foreground web:shadow-sm web:hover:bg-destructive/90",
        outline:
          "web:border web:border-input web:bg-background web:shadow-sm web:hover:bg-accent web:hover:text-accent-foreground",
        secondary:
          "web:bg-secondary web:text-secondary-foreground web:shadow-sm web:hover:bg-secondary/80",
        ghost: "web:hover:bg-accent web:hover:text-accent-foreground",
        link: "web:text-primary web:underline-offset-4 web:hover:underline",
      },
      size: {
        default: "web:h-9 web:px-4 web:py-2",
        sm: "web:h-8 web:rounded-md web:px-3 web:text-xs",
        lg: "web:h-10 web:rounded-md web:px-8",
        icon: "web:h-9 web:w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        data-variant={variant || "default"}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
