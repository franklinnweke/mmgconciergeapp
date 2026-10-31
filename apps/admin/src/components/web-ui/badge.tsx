// shadcn/ui (MIT), new-york registry; utilities prefixed for this workspace.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/features/web/utils";

const badgeVariants = cva(
  "web:inline-flex web:items-center web:rounded-md web:border web:px-2.5 web:py-0.5 web:text-xs web:font-semibold web:transition-colors web:focus:outline-none web:focus:ring-2 web:focus:ring-ring web:focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "web:border-transparent web:bg-primary web:text-primary-foreground web:shadow web:hover:bg-primary/80",
        secondary:
          "web:border-transparent web:bg-secondary web:text-secondary-foreground web:hover:bg-secondary/80",
        destructive:
          "web:border-transparent web:bg-destructive web:text-destructive-foreground web:shadow web:hover:bg-destructive/80",
        outline: "web:text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
