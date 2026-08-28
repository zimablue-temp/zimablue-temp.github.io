const SHORT = ["в","и","на","с","к","о","от","по","не","а","но","за","из","до","у","во","со","об","то"];

export const TYPO_ENABLED = process.env.TYPO === "1";

export function typo(input) {
  if (!TYPO_ENABLED || typeof input !== "string") return input;
  let s = input.replace(/ -- /g, " — ");
  const alt = SHORT.join("|");
  s = s.replace(new RegExp(`(^|[\\s(])(${alt}) `, "gi"), (_, p, w) => `${p}${w} `);
  return s;
}
