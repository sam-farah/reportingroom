/**
 * Checks the scraping helpers inside chrome-extension/content.js against the
 * markup the Clinic to Cloud scheduler actually produces.
 *
 * The functions are pulled straight out of the shipped file rather than copied,
 * so this cannot drift away from what runs in the browser. Only the pure
 * parsing is covered here — whether the selectors match the live page can only
 * be confirmed on the real scheduler.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";

const src = readFileSync("chrome-extension/content.js", "utf8");

function extract(pattern: RegExp): string {
  const m = src.match(pattern);
  if (!m) throw new Error(`content.js no longer contains ${pattern} — update this test`);
  return m[0];
}

// Minimal stand-in for the textarea trick content.js uses to decode entities.
const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&nbsp;": " ",
};
(globalThis as any).document = {
  createElement: () => ({
    innerHTML: "",
    get value() {
      return String(this.innerHTML).replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp);/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
    },
  }),
};

const titleField = new Function(
  `${extract(/function decodeEntities\(text\) \{[\s\S]*?\n  \}/)}
   ${extract(/function titleField\(title, label\) \{[\s\S]*?\n  \}/)}
   return titleField;`
)() as (title: string, label: string) => string | null;

const stripAge = new Function(
  "rawName",
  `return ${extract(/rawName\.replace\([^)]*\)/)}.trim();`
) as (rawName: string) => string;

// Exactly what the scheduler's eventTemplate emits for a patient booking
// (BookingType == 1), with the tags left literal inside the attribute value.
const TITLE =
  "Location: <strong>Knox Private Hospital</strong><br/>" +
  "Full Name: <strong>Daniela Tasker 51yrs</strong><br/>" +
  " Birthday: <strong>04 August, 1975</strong><br/>" +
  " Phone: <strong>0408 644 474</strong><br/>" +
  "Billing Type: Private<br/>Invoiced: $0.00<br/>Appt. Type: Vascular Ultrasound<br/>" +
  "Booked by Sameh Farah on 03/08/2026<br/>Notes: ";

{
  assert.strictEqual(titleField(TITLE, "Full Name"), "Daniela Tasker 51yrs");
  assert.strictEqual(titleField(TITLE, "Birthday"), "04 August, 1975");
  assert.strictEqual(titleField(TITLE, "Phone"), "0408 644 474");
  assert.strictEqual(titleField(TITLE, "Location"), "Knox Private Hospital");
}

// The age is rendered inside the name and has to come off before matching.
{
  assert.strictEqual(stripAge("Daniela Tasker 51yrs"), "Daniela Tasker");
  assert.strictEqual(stripAge("Luigino (Gino) Briganti 66yrs"), "Luigino (Gino) Briganti");
  assert.strictEqual(stripAge("Barry Towns 1yr"), "Barry Towns");
  assert.strictEqual(stripAge("Barry Towns"), "Barry Towns", "no age present is fine");
}

// A patient with no date of birth on file renders empty <strong></strong>;
// that must read as "unknown", not as an empty string we try to match on.
{
  const noDob = TITLE.replace("04 August, 1975", "");
  assert.strictEqual(titleField(noDob, "Birthday"), null);
}

// Names are HTML-encoded by the template, so apostrophes come back escaped.
{
  const encoded = TITLE.replace("Daniela Tasker", "Siobhan O&#39;Brien");
  assert.strictEqual(titleField(encoded, "Full Name"), "Siobhan O'Brien 51yrs");
}

// Non-patient and group bookings have no "Full Name", which is how collectRows
// tells them apart from real patient bookings.
{
  const nonPatient = 'Location: &lt;strong&gt;Knox&lt;/strong&gt;&lt;br/&gt;Notes: Theatre list';
  assert.strictEqual(titleField(nonPatient, "Full Name"), null);
  assert.strictEqual(titleField(nonPatient, "Notes"), "Theatre list");
}

console.log("All chrome-extension/content.js scraping tests passed.");
