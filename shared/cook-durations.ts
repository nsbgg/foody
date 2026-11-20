export type StepDuration = { label: string; seconds: number };

type DurationToken = {
  start: number;
  end: number;
  seconds: number;
  rank: number;
  invalid: boolean;
};
const number = String.raw`\d+(?:\s*\/\s*\d+|[.,]\d+)?`;
const quantity = String.raw`(?:${number}|einer?)`;
const units = String.raw`stunden?|std\.?|hours?|hrs?\.?|h|minuten?|minutes?|mins?\.?|sekunden?|seconds?|secs?\.?|sek\.?|s`;
const halfHour = String.raw`(?:eine\s+)?halb(?:e|en)?\s+Stunde|(?:a\s+)?half(?:\s+an?)?\s+hour`;

function numeric(text: string) {
  if (/^einer?$/iu.test(text)) return 1;
  if (text.includes("/")) {
    const [numerator, denominator] = text.split("/").map(Number);
    return denominator ? numerator / denominator : NaN;
  }
  return Number(text.replace(",", "."));
}

/** Extract measured, actionable durations; unitless numbers are never timers.
 * Labels retain the source phrase. Ranges use their upper numeric endpoint,
 * descending adjacent units combine, and equivalent durations appear once.
 */
export function extractStepDurations(step: string): StepDuration[] {
  const pattern = new RegExp(
    String.raw`(?<![\p{L}\p{N}_.,/:+])(?:(?<half>${halfHour})|(?<low>${quantity})(?:\s*(?:[-–—]|bis\b|to\b)\s*(?<high>${number}))?\s*(?<unit>${units}))(?![\p{L}\p{N}_])`,
    "giu",
  );
  const tokens: DurationToken[] = [];
  for (const match of step.matchAll(pattern)) {
    const unit = match.groups!.unit?.toLowerCase() || "h";
    const rank = /^(?:h|stunde|std)/u.test(unit) ? 3 : /^m/u.test(unit) ? 2 : 1;
    const amount = match.groups!.half
      ? 0.5
      : Math.max(
          numeric(match.groups!.low),
          numeric(match.groups!.high || match.groups!.low),
        );
    const prefix = step.slice(0, match.index);
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      seconds: amount * (rank === 3 ? 3600 : rank === 2 ? 60 : 1),
      rank,
      invalid:
        !Number.isFinite(amount) ||
        /(?:[-−–—]\s*|\b(?:minus|negative)\s+)$/iu.test(prefix),
    });
  }
  const results: StepDuration[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < tokens.length; index++) {
    const first = tokens[index];
    let last = first;
    let seconds = first.seconds;
    let invalid = first.invalid;
    while (index + 1 < tokens.length) {
      const next = tokens[index + 1];
      const between = step.slice(last.end, next.start);
      if (
        next.rank >= last.rank ||
        !/^\s*,?\s*(?:(?:und|and)\s+)?$/iu.test(between)
      )
        break;
      seconds += next.seconds;
      invalid ||= next.invalid;
      last = next;
      index++;
    }
    // The timer runs at second precision. Do not turn subsecond/oversized input
    // into a misleading zero-second or truncated 24-hour timer.
    const rounded = Math.round(seconds);
    if (
      invalid ||
      seconds <= 0 ||
      seconds > 86400 ||
      rounded < 1 ||
      seen.has(rounded)
    )
      continue;
    seen.add(rounded);
    results.push({
      label: step.slice(first.start, last.end),
      seconds: rounded,
    });
  }
  return results;
}
