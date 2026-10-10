import { Fragment, useMemo } from "react";

interface Props {
  text: string;
  /** Stagger between sentences in ms. */
  delayPerSentence?: number;
  /** Skip fade-in entirely. Use for restored sessionStorage messages so the
   *  user doesn't re-watch animations on every navigation. */
  instant?: boolean;
  className?: string;
}

/**
 * Renders text sentence-by-sentence with a staggered opacity fade-in.
 * No streaming, no typewriter — just smooth appearance.
 *
 * The text is passed through `tidyLlmText` first as a safety net: the system
 * prompt asks the model not to use markdown, but if it slips in `**bold**` or
 * a numbered list, we'd rather render it as proper text than show literal
 * asterisks to the user.
 */
export default function FadingText({ text, delayPerSentence = 220, instant, className }: Props) {
  const tidied = useMemo(() => tidyLlmText(text), [text]);
  const sentences = useMemo(() => splitSentences(tidied), [tidied]);
  return (
    <span className={className}>
      {sentences.map((s, i) => (
        <span
          key={`${i}:${s.slice(0, 12)}`}
          style={
            instant
              ? undefined
              : {
                  opacity: 0,
                  animation: "fadeInSentence 0.55s ease-out forwards",
                  animationDelay: `${i * delayPerSentence}ms`,
                  display: "inline",
                }
          }
        >
          {renderInline(s)}
          {i < sentences.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/** Naive sentence splitter — fine for our LLM output style. */
function splitSentences(text: string): string[] {
  if (!text) return [];
  // Preserve hard line-breaks: bullets like "1. Lisbon — €980" should land on
  // their own line. We keep `\n` as its own split point so the renderer can
  // emit a <br/> for it.
  const lines = text.split(/\n+/);
  const parts: string[] = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line) continue;
    // Sentence-split *within* a line. Cross-line splits would re-join list
    // items into one paragraph and we'd lose readability.
    const within = line.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
    parts.push(...(within.length > 0 ? within : [line]));
    if (li < lines.length - 1) parts.push("\n");
  }
  return parts.length > 0 ? parts : [text];
}

/**
 * Strip / normalise the markdown artefacts LLMs occasionally produce despite
 * being told to write plain prose. We render the result inline, so anything
 * we don't transform here would otherwise show up as literal characters.
 */
function tidyLlmText(text: string): string {
  if (!text) return text;
  let out = text;
  // 1. Drop fenced code blocks entirely — the user is asking about tours,
  //    not code. Backticks should never reach a traveller.
  out = out.replace(/```[\s\S]*?```/g, "").replace(/`([^`]+)`/g, "$1");
  // 2. Markdown headers ("### Title") → plain line.
  out = out.replace(/^\s*#{1,6}\s+/gm, "");
  // 3. Bullet markers ("- item", "* item", "• item") at the start of a line →
  //    plain line + newline. We keep them on separate lines so the eye can
  //    parse them as a list visually.
  out = out.replace(/^\s*[-*•]\s+/gm, "\n");
  // 4. Numbered list markers ("1. ", "2) ") → newline so each entry sits on
  //    its own row. Drop the marker itself because the prose reads naturally
  //    without "1." prefixes ("Lisbon for €980. Budapest for €720.").
  out = out.replace(/(^|\n)\s*\d+[.)]\s+/g, "$1");
  // 5. Collapse the "**word**" / "*word*" markdown emphasis to plain text.
  //    We *could* render bold inline, but the LLM tends to bold whole
  //    sentences which fights the typography — plain is calmer.
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(?<!\w)\*([^*\s][^*]*?)\*(?!\w)/g, "$1");
  // 6. Tidy stray multiple blank lines.
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

/** Render a sentence — emit a <br/> for the "\n" sentinels splitSentences
 *  inserts, otherwise pass the text through verbatim. */
function renderInline(s: string) {
  if (s === "\n") return <br />;
  return <Fragment>{s}</Fragment>;
}
