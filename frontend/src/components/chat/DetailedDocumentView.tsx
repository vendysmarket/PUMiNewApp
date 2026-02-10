import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Download } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface DetailedDocumentViewProps {
  title: string;
  content: string;
  category?: string;
  tokensUsed?: number;
}

const DetailedDocumentView = ({ title, content, category, tokensUsed }: DetailedDocumentViewProps) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast({ description: "📋 Másolva!" });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ description: "❌ Másolás sikertelen" });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "_")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ description: "💾 Letöltve!" });
  };

  return (
    <div className="max-w-3xl mx-auto my-6 rounded-xl border border-foreground/20 bg-foreground/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/10 bg-foreground/[0.03]">
        <div className="flex-1">
          <h2 className="text-lg font-medium text-foreground/90 mb-1">{title}</h2>
          <div className="flex items-center gap-3 text-xs text-foreground/40">
            {category && (
              <span className="px-2 py-0.5 rounded-full bg-foreground/5 border border-foreground/10">{category}</span>
            )}
            {tokensUsed && <span>{tokensUsed.toLocaleString()} tokens</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-2 text-foreground/50 hover:text-foreground/80 hover:bg-foreground/5 rounded-lg transition-all"
            title="Másolás"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 text-foreground/50 hover:text-foreground/80 hover:bg-foreground/5 rounded-lg transition-all"
            title="Letöltés"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Markdown Content */}
      <div className="px-6 py-5">
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            components={{
              // Code blocks
              code({ node, className, children, ...props }: any) {
                const inline = !className;
                const match = /language-(\w+)/.exec(className || "");
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      borderRadius: "0.5rem",
                      padding: "1rem",
                      fontSize: "0.875rem",
                      backgroundColor: "rgba(0, 0, 0, 0.3)",
                    }}
                    {...props}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                ) : (
                  <code
                    className="px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/90 text-sm font-mono"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },

              // Headings
              h1: ({ children }) => (
                <h1 className="text-2xl font-semibold mt-8 mb-4 text-foreground/90 border-b border-foreground/10 pb-3">
                  {children}
                </h1>
              ),
              h2: ({ children }) => <h2 className="text-xl font-semibold mt-6 mb-3 text-foreground/85">{children}</h2>,
              h3: ({ children }) => <h3 className="text-lg font-medium mt-5 mb-2 text-foreground/80">{children}</h3>,

              // Lists
              ul: ({ children }) => (
                <ul className="list-disc list-inside space-y-1.5 text-foreground/70 my-3">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside space-y-1.5 text-foreground/70 my-3">{children}</ol>
              ),
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,

              // Paragraphs
              p: ({ children }) => <p className="text-foreground/75 leading-relaxed my-3">{children}</p>,

              // Links
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline transition-colors"
                >
                  {children}
                </a>
              ),

              // Blockquotes
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-foreground/20 pl-4 my-4 text-foreground/60 italic">
                  {children}
                </blockquote>
              ),

              // Tables
              table: ({ children }) => (
                <div className="overflow-x-auto my-4">
                  <table className="min-w-full border border-foreground/10">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-foreground/5">{children}</thead>,
              th: ({ children }) => (
                <th className="px-4 py-2 text-left text-foreground/80 font-medium border-b border-foreground/10">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-4 py-2 text-foreground/70 border-b border-foreground/5">{children}</td>
              ),

              // Horizontal rule
              hr: () => <hr className="my-6 border-foreground/10" />,

              // Strong/Bold
              strong: ({ children }) => <strong className="font-semibold text-foreground/90">{children}</strong>,

              // Emphasis/Italic
              em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default DetailedDocumentView;
