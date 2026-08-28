import { readFileSync } from "node:fs";

const PAIRS = [
  ["_site/index.html", "test/fixtures/index.golden.html"],
  ["_site/404.html", "test/fixtures/404.golden.html"],
];

// Named entities the source uses.
// &nbsp; and a literal NBSP both fold to the same sentinel and are NOT
// collapsed as whitespace, so a dropped non-breaking space fails parity.
const ENTITIES = {
  "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–",
  "&laquo;": "«", "&raquo;": "»", "&rsquo;": "’",
  "&lsquo;": "‘", "&amp;": "&", "&quot;": '"', "&#39;": "'",
};
// ^ the value paired with "&nbsp;" above is a LITERAL U+00A0 byte, not a
//   regular space. Keep it that way.

function normalize(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, "");           // strip HTML comments
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  s = s.replace(/[ \t\r\n\f]+/g, " ");             // collapse ASCII whitespace; NBSP survives
  s = s.replace(/> </g, "><");                     // drop inter-tag spaces
  s = s.replace(/ >/g, ">").replace(/< /g, "<");
  s = s.replace(/ *\/>/g, ">");                    // <br /> -> <br>
  return s.trim();
}

// NOTE: JS `\s` matches U+00A0, so the regexes above deliberately use an
// explicit ASCII class to keep non-breaking spaces scored. Adjust the
// normalizer ONLY for truly insignificant differences (indentation,
// `/>` style) — never to hide a real markup or text change.

function lineDiff(a, b) {
  // crude token diff for the report: split on "><" boundaries
  const ax = a.replace(/></g, ">\n<").split("\n");
  const bx = b.replace(/></g, ">\n<").split("\n");
  const out = [];
  const n = Math.max(ax.length, bx.length);
  for (let i = 0; i < n; i++) {
    if (ax[i] !== bx[i]) {
      out.push(`  line ${i + 1}:`);
      out.push(`   - got:    ${ax[i] ?? "<eof>"}`);
      out.push(`   + expect: ${bx[i] ?? "<eof>"}`);
      if (out.length > 60) { out.push("  ... (truncated)"); break; }
    }
  }
  return out.join("\n");
}

let failed = false;
for (const [got, expect] of PAIRS) {
  const g = normalize(readFileSync(got, "utf8"));
  const e = normalize(readFileSync(expect, "utf8"));
  if (g === e) {
    console.log(`PASS  ${got}`);
  } else {
    failed = true;
    console.log(`FAIL  ${got}  != ${expect}`);
    console.log(lineDiff(g, e));
  }
}
process.exit(failed ? 1 : 0);
