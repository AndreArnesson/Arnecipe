import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  count?: number;
}

export function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
  showValue = false,
  count,
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = hoverValue ?? value;

  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const handleClick = (starIndex: number, isHalf: boolean) => {
    if (readonly || !onChange) return;
    const newValue = isHalf ? starIndex + 0.5 : starIndex + 1;
    // Toggle off if clicking same value
    onChange(newValue === value ? 0 : newValue);
  };

  const handleMouseMove = (e: React.MouseEvent, starIndex: number) => {
    if (readonly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isHalf = x < rect.width / 2;
    setHoverValue(isHalf ? starIndex + 0.5 : starIndex + 1);
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex" onMouseLeave={() => setHoverValue(null)}>
        {[0, 1, 2, 3, 4].map((starIndex) => {
          const fillAmount = Math.min(1, Math.max(0, displayValue - starIndex));
          return (
            <div
              key={starIndex}
              className={cn(
                "relative",
                !readonly && "cursor-pointer"
              )}
              onMouseMove={(e) => handleMouseMove(e, starIndex)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                handleClick(starIndex, x < rect.width / 2);
              }}
            >
              {/* Empty star background */}
              <Star className={cn(sizeClasses[size], "text-muted-foreground/30")} />
              {/* Filled overlay */}
              {fillAmount > 0 && (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fillAmount * 100}%` }}
                >
                  <Star
                    className={cn(
                      sizeClasses[size],
                      "fill-primary text-primary"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showValue && value > 0 && (
        <span className="text-sm font-medium text-foreground ml-1">
          {value.toFixed(1)}
        </span>
      )}
      {count !== undefined && count > 0 && (
        <span className="text-xs text-muted-foreground ml-0.5">
          ({count})
        </span>
      )}
    </div>
  );
}
