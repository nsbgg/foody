import test from "node:test";
import assert from "node:assert/strict";
import { extractStepDurations } from "../shared/cook-durations.ts";

test("extracts German and English timing units with decimal commas and second precision", () => {
  assert.deepEqual(
    extractStepDurations(
      "45 Sekunden rühren, 1,5 Minuten warten. Bake for 2 hours, then rest 1.25 min.",
    ),
    [
      { label: "45 Sekunden", seconds: 45 },
      { label: "1,5 Minuten", seconds: 90 },
      { label: "2 hours", seconds: 7200 },
      { label: "1.25 min.", seconds: 75 },
    ],
  );
  assert.deepEqual(
    extractStepDurations("20sec warten; 2 h ziehen; 1 Sek. rühren."),
    [
      { label: "20sec", seconds: 20 },
      { label: "2 h", seconds: 7200 },
      { label: "1 Sek.", seconds: 1 },
    ],
  );
});

test("combines adjacent descending units as one actionable timer", () => {
  assert.deepEqual(
    extractStepDurations(
      "1 Stunde 30 Minuten und 15 Sekunden garen. Dann 1 min, 20 seconds rühren.",
    ),
    [
      { label: "1 Stunde 30 Minuten und 15 Sekunden", seconds: 5415 },
      { label: "1 min, 20 seconds", seconds: 80 },
    ],
  );
  assert.deepEqual(
    extractStepDurations("10 Minuten warten, dann 30 Sekunden rühren."),
    [
      { label: "10 Minuten", seconds: 600 },
      { label: "30 Sekunden", seconds: 30 },
    ],
  );
});

test("recognizes German Std abbreviations and common singular wording", () => {
  assert.deepEqual(
    extractStepDurations(
      "1 Std. 30 Minuten ruhen; danach 2 Std ziehen lassen. Eine Minute rühren, nach einer Sekunde stoppen.",
    ),
    [
      { label: "1 Std. 30 Minuten", seconds: 5400 },
      { label: "2 Std", seconds: 7200 },
      { label: "Eine Minute", seconds: 60 },
      { label: "einer Sekunde", seconds: 1 },
    ],
  );
});

test("uses the upper endpoint of ranges and retains original labels", () => {
  assert.deepEqual(
    extractStepDurations(
      "10–15 Minuten backen; 1 bis 2 Stunden ruhen; 20 to 30 seconds rühren; 5-3 min ziehen.",
    ),
    [
      { label: "10–15 Minuten", seconds: 900 },
      { label: "1 bis 2 Stunden", seconds: 7200 },
      { label: "20 to 30 seconds", seconds: 30 },
      { label: "5-3 min", seconds: 300 },
    ],
  );
});

test("recognizes half hours and numeric fractions without arbitrary word numbers", () => {
  assert.deepEqual(
    extractStepDurations(
      "Eine halbe Stunde garen. Half an hour ruhen. 1/4 Stunde abkühlen.",
    ),
    [
      { label: "Eine halbe Stunde", seconds: 1800 },
      { label: "1/4 Stunde", seconds: 900 },
    ],
  );
  assert.deepEqual(extractStepDurations("half an hour and 15 minutes"), [
    { label: "half an hour and 15 minutes", seconds: 2700 },
  ]);
});

test("deduplicates equivalent durations while keeping the first source phrase", () => {
  assert.deepEqual(
    extractStepDurations(
      "5 Minuten backen. 300 Sekunden warten. 5 min rühren. 10 Minuten ruhen.",
    ),
    [
      { label: "5 Minuten", seconds: 300 },
      { label: "10 Minuten", seconds: 600 },
    ],
  );
});

test("ignores dates, clock times, temperatures, signed, zero and oversized durations", () => {
  for (const text of [
    "Am 2026-11-20 um 12:30 bei 180 °C backen.",
    "2026/11/20 Minuten",
    "2026-11-20 Minuten",
    "180 Grad",
    "0 Minuten",
    "-5 Minuten",
    "- 5 Minuten",
    "minus 5 Minuten",
    "negative 5 minutes",
    "25 Stunden 10 Minuten",
    "24 Stunden 1 Sekunde",
    "1/0 Stunde",
    "0.1 Sekunden",
  ]) {
    assert.deepEqual(extractStepDurations(text), [], text);
  }
  assert.deepEqual(
    extractStepDurations(
      "24 Stunden kalt stellen; 0 Minuten warten, danach 2 Minuten rühren",
    ),
    [
      { label: "24 Stunden", seconds: 86400 },
      { label: "2 Minuten", seconds: 120 },
    ],
  );
});

test("matches only complete unit tokens and preserves surrounding prose boundaries", () => {
  assert.deepEqual(
    extractStepDurations(
      "Zutaten5minutenlang; 30 Millimeter; 5 m Abstand; 20 Sekunden rühren.",
    ),
    [{ label: "20 Sekunden", seconds: 20 }],
  );
});
