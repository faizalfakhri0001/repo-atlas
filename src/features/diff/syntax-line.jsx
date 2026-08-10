import { cn } from "@/lib/utils";
import { tokenClass, tokenizeLine } from "@/features/diff/syntax-highlighter";

export function SyntaxLine({ text, language = "text", enabled = true, wrap = false }) {
  const tokens = enabled ? tokenizeLine(text, language) : [{ type: "plain", text: String(text ?? "") }];
  return (
    <code className={cn("min-w-0 pr-6", wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre")}>
      {tokens.length === 0
        ? " "
        : tokens.map((token, index) => <span key={`${token.type}-${index}`} className={tokenClass(token.type)}>{token.text}</span>)}
    </code>
  );
}
