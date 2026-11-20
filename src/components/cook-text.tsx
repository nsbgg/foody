type Segment = { text: string; ingredient: boolean };

function sliceSegments(parts: readonly Segment[], start: number, end: number) {
  let offset = 0;
  return parts.flatMap((part) => {
    const left = Math.max(0, start - offset);
    const right = Math.min(part.text.length, end - offset);
    offset += part.text.length;
    return right > left
      ? [{ text: part.text.slice(left, right), ingredient: part.ingredient }]
      : [];
  });
}

// Visible text and its measurement probe share exactly the same runs, including
// pages that start halfway through a sentence. Offsets are UTF-16 text offsets.
function sentenceRuns(parts: readonly Segment[], start: number, end: number) {
  const text = parts
    .map((part) => part.text)
    .join("")
    .slice(start, end);
  const segmenter = new Intl.Segmenter("de", { granularity: "sentence" });
  return Array.from(segmenter.segment(text), ({ index, segment }) =>
    sliceSegments(parts, start + index, start + index + segment.length),
  );
}

export function CookText({
  parts,
  start,
  end,
}: {
  parts: readonly Segment[];
  start: number;
  end: number;
}) {
  return sentenceRuns(parts, start, end).map((sentence, index) => (
    <span className="cook-sentence" key={index}>
      {sentence.map((part, index) =>
        part.ingredient ? (
          <mark className="cook-ingredient" key={index}>
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </span>
  ));
}

export function measureCookText(
  probe: HTMLParagraphElement,
  parts: readonly Segment[],
  start: number,
  end: number,
) {
  const nodes = sentenceRuns(parts, start, end).map((sentence) => {
    const line = document.createElement("span");
    line.className = "cook-sentence";
    for (const part of sentence) {
      if (part.ingredient) {
        const mark = document.createElement("mark");
        mark.className = "cook-ingredient";
        mark.textContent = part.text;
        line.append(mark);
      } else line.append(document.createTextNode(part.text));
    }
    return line;
  });
  probe.replaceChildren(...nodes);
}
