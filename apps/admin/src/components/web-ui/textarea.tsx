// shadcn/ui (MIT), new-york registry; utilities prefixed for this workspace.
import * as React from "react";

import { cn } from "@/features/web/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "web:flex web:min-h-[60px] web:w-full web:rounded-md web:border web:border-input web:bg-transparent web:px-3 web:py-2 web:text-base web:shadow-sm web:placeholder:text-muted-foreground web:focus-visible:outline-none web:focus-visible:ring-1 web:focus-visible:ring-ring web:disabled:cursor-not-allowed web:disabled:opacity-50 web:md:text-sm",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
