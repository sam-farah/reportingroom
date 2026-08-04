import assert from "node:assert";
import { normalisePhone, parseName, namesMatch, matchBookings } from "../server/services/bookingMatch";

// ---------- phone normalisation ----------
// The formats below are all real shapes found in the production scan_requests
// table, plus the way the scheduler renders them.
{
  assert.strictEqual(normalisePhone("0408644474"), "0408644474");
  assert.strictEqual(normalisePhone("0419 004 421"), "0419004421");
  assert.strictEqual(normalisePhone("04 4800 5843"), "0448005843");
  assert.strictEqual(normalisePhone(" 039512 0012"), "0395120012");
  assert.strictEqual(normalisePhone("+61 408 644 474"), "0408644474");
  assert.strictEqual(normalisePhone("+61408644474"), "0408644474");
  assert.strictEqual(normalisePhone("0061408644474"), "0408644474");
  assert.strictEqual(normalisePhone(null), "");
  // Same person, two formats, must compare equal
  assert.strictEqual(normalisePhone("0425 858 262"), normalisePhone("0425858262"));
}

// ---------- name parsing ----------
{
  assert.deepStrictEqual(parseName("Mrs Daniela Tasker"), { surname: "tasker", given: ["daniela"] });
  assert.deepStrictEqual(parseName("Dr Paul Simkin"), { surname: "simkin", given: ["paul"] });
  assert.deepStrictEqual(parseName("Stephen Dunstone"), { surname: "dunstone", given: ["stephen"] });
  // Parenthesised nickname is kept as an extra given name, not discarded
  const gino = parseName("Mr Luigino (Gino) Briganti");
  assert.strictEqual(gino!.surname, "briganti");
  assert.ok(gino!.given.includes("luigino") && gino!.given.includes("gino"));
  assert.strictEqual(parseName(""), null);
  assert.strictEqual(parseName("Mr"), null);
}

// ---------- name matching ----------
{
  const m = (a: string, b: string) => namesMatch(parseName(a)!, parseName(b)!);

  assert.ok(m("Mrs Daniela Tasker", "Daniela Tasker"));
  assert.ok(m("Mr Timothy Plozza", "Tim Plozza"));             // known short form
  assert.ok(m("Mr Luigino (Gino) Briganti", "Gino Briganti")); // nickname in brackets
  assert.ok(m("Mr Barry Towns", "BARRY TOWNS"));               // case
  assert.ok(m("Ms Andrea Bellato", "Andrea Maria Bellato"));   // extra middle name
  assert.ok(m("Mr Dan Tasker", "Daniel Tasker"));              // curated equivalence

  assert.ok(!m("Mrs Daniela Tasker", "Mr David Tasker"), "family member must not match");
  assert.ok(!m("Mr Barry Towns", "Mr Barry Townsend"), "different surname must not match");
  assert.ok(!m("Mr Dominic Love", "Ms Andrea Bellato"));

  // The whole reason given names are matched exactly rather than by prefix:
  // households share a phone, so "Dan" must not reach "Daniela".
  assert.ok(!m("Mr Dan Tasker", "Daniela Tasker"), "prefix must not match across a household");
  assert.ok(!m("Mrs Dani Tasker", "Daniela Tasker"), "unlisted short form must fail closed");
  assert.ok(!m("D Tasker", "David Tasker"), "single initial must not match");

  // A surname on its own is not evidence of who the booking belongs to
  assert.ok(!m("Tasker", "Daniela Tasker"), "surname-only booking must fail closed");
  assert.ok(!m("Mrs Daniela Tasker", "Tasker"), "surname-only referral must fail closed");
}

// ---------- end to end ----------
{
  const rows = [
    { name: "Mrs Daniela Tasker", phone: "0408644474" },
    { name: "Mr Barry Towns", phone: "0419 004 421" },
    { name: "Mr Luigino (Gino) Briganti", phone: "0425 858 262" },
    { name: "Mr Dominic Love", phone: "0415937803" },
  ];
  const referrals = [
    { patientName: "Daniela Tasker", phones: ["+61 408 644 474"] },
    { patientName: "Gino Briganti", phones: ["0425858262"] },
    { patientName: "Dominic Love", phones: ["0499 999 999"] }, // right name, wrong phone
  ];
  assert.deepStrictEqual(matchBookings(rows, referrals), [0, 2]);
}

// A referral for a family member on the same phone must not tick the other's row
{
  const rows = [{ name: "Mrs Daniela Tasker", phone: "0408644474" }];
  const referrals = [{ patientName: "David Tasker", phones: ["0408644474"] }];
  assert.deepStrictEqual(matchBookings(rows, referrals), []);
}

// Real case from production: a referral was saved carrying a DIFFERENT patient's
// mobile, while the linked patient file held the right one. The correct phone
// must recover the booking, and the wrong one must not tick the other patient.
{
  const rows = [
    { name: "Mrs Daniela Tasker", phone: "0408644474" },
    { name: "Mrs Amanda Hurdle", phone: "0401 857 328" },
  ];
  const referrals = [
    { patientName: "Daniela Tasker", phones: ["0408644474", "0408644474"] },
    // referral phone is Tasker's; patient file phone is Hurdle's own
    { patientName: "Amanda Hurdle", phones: ["0408644474", "0401857328"] },
  ];
  assert.deepStrictEqual(matchBookings(rows, referrals), [0, 1]);
}

// Two bookings for the same patient on the same day must BOTH be ticked,
// otherwise the second one looks outstanding.
{
  const rows = [
    { name: "Mrs Daniela Tasker", phone: "0408644474" },
    { name: "Mr Barry Towns", phone: "0419004421" },
    { name: "Mrs Daniela Tasker", phone: "0408644474" },
  ];
  const referrals = [{ patientName: "Daniela Tasker", phones: ["0408644474"] }];
  assert.deepStrictEqual(matchBookings(rows, referrals), [0, 2]);
}

// Unusable data is skipped rather than matched loosely
{
  const rows = [{ name: "Mrs Daniela Tasker", phone: "123" }];
  const referrals = [{ patientName: "Daniela Tasker", phones: ["123"] }];
  assert.deepStrictEqual(matchBookings(rows, referrals), [], "too-short phone must not match");

  assert.deepStrictEqual(
    matchBookings([{ name: "Daniela Tasker", phone: "0408644474" }], [{ patientName: null, phones: ["0408644474"] }]),
    [],
    "referral with no name must not match",
  );

  assert.deepStrictEqual(
    matchBookings([{ name: "Daniela Tasker", phone: "0408644474" }], [{ patientName: "Daniela Tasker", phones: [null, undefined, ""] }]),
    [],
    "referral with no usable phone must not match on name alone",
  );
}

console.log("All server/services/bookingMatch.ts tests passed.");
