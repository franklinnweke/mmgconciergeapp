// shadcn/ui (MIT), new-york registry; utilities prefixed for this workspace.
import * as React from "react";

import { cn } from "@/features/web/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "web:flex web:h-9 web:w-full web:rounded-md web:border web:border-input web:bg-transparent web:px-3 web:py-1 web:text-base web:shadow-sm web:transition-colors web:file:border-0 web:file:bg-transparent web:file:text-sm web:file:font-medium web:file:text-foreground web:placeholder:text-muted-foreground web:focus-visible:outline-none web:focus-visible:ring-1 web:focus-visible:ring-ring web:disabled:cursor-not-allowed web:disabled:opacity-50 web:md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
