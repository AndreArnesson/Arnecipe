import React from "react";

const URL_REGEX = /(https?:\/\/[^\s),]+)/g;

interface LinkifyTextProps {
  text: string;
  className?: string;
}

export function LinkifyText({ text, className }: LinkifyTextProps) {
  const parts = text.split(URL_REGEX);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80 break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {new URL(part).hostname}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </span>
  );
}
