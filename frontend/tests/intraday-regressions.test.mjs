import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd(), "src");

function readSource(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

test("breakout signal uses the new breakoutBadgeMarker overlay", () => {
  const source = readSource("shared/charts/kline-chart.tsx");

  assert.match(source, /name:\s*"breakoutBadgeMarker"/);
  assert.match(source, /extendData:\s*"突破"/);
  assert.doesNotMatch(source, /name:\s*"breakoutMarker"/);
});

test("market context tooltip uses an opaque white background", () => {
  const source = readSource("features/intraday/market-context-bar.tsx");

  assert.match(source, /TooltipContent[^]*className="w-\[320px\] p-0 bg-white text-slate-900 border-slate-200 shadow-2xl"/);
  assert.match(source, /className="rounded-md border border-slate-200 bg-white"/);
});
