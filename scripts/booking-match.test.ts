import assert from "node:assert";
import { normalisePhone, normaliseDob, parseName, namesMatch, matchBookings } from "../server/services/bookingMatch";

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
  assert.strictEqual(normalisePhone("0425 858 262"), normalisePhone("0425858262"));
}

// ---------- date of birth normalisation ----------
// The database stores ISO; the scheduler renders "dd MMMM, yyyy".
{
  assert.strictEqual(normaliseDob("1975-08-04"), "1975-08-04");
  assert.strictEqual(normaliseDob("04 August, 1975"), "1975-08-04");
  assert.strictEqual(normaliseDob("4 August 1975"), "1975-08-04");
  assert.strictEqual(normaliseDob("August 4, 1975"), "1975-08-04");
  assert.strictEqual(normaliseDob("04/08/1975"), "1975-08-04"); // day first
  assert.strictEqual(normaliseDob("1947-01-08"), "1947-01-08");
  assert.strictEqual(normaliseDob(""), "");
  assert.strictEqual(normaliseDob(null), "");
  assert.strictEqual(normaliseDob("not a date"), "");
  assert.strictEqual(normaliseDob("1975-13-04"), "", "impossible month is rejected");
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
// A booking matches when the name agrees AND at least one of date of birth or
// phone agrees.
{
  const rows = [
    { name: "Mrs Daniela Tasker", dob: "04 August, 1975", phone: "0408644474" },
    { name: "Mr Barry Towns", dob: "08 January, 1947", phone: "0419 004 421" },
    { name: "Mr Luigino (Gino) Briganti", dob: "21 December, 1959", phone: "0425 858 262" },
    { name: "Mr Dominic Love", dob: "15 April, 1977", phone: "0415937803" },
  ];
  const referrals = [
    { patientName: "Daniela Tasker", phones: ["+61 408 644 474"], dobs: ["1975-08-04"] },
    { patientName: "Gino Briganti", phones: ["0425858262"], dobs: [] },
    // right name, but neither the phone nor the DOB agrees
    { patientName: "Dominic Love", phones: ["0499 999 999"], dobs: ["1980-01-01"] },
  ];
  assert.deepStrictEqual(matchBookings(rows, referrals), [0, 2]);
}

// Date of birth alone corroborates the name, so a referral saved with the wrong
// phone still ticks.
{
  const rows = [{ name: "Mrs Amanda Hurdle", dob: "12 March, 1962", phone: "0401 857 328" }];
  const referrals = [{ patientName: "Amanda Hurdle", phones: ["0408644474"], dobs: ["1962-03-12"] }];
  assert.deepStrictEqual(matchBookings(rows, referrals), [0], "DOB must corroborate when the phone is wrong");
}

// Real production collision: two different patients on one phone number. The
// name check is what stops the wrong one ticking.
{
  const rows = [{ name: "Mrs Daniela Tasker", dob: "04 August, 1975", phone: "0408644474" }];
  const referrals = [{ patientName: "Amanda Hurdle", phones: ["0408644474"], dobs: ["1962-03-12"] }];
  assert.deepStrictEqual(matchBookings(rows, referrals), []);
}

// A shared date of birth is not enough on its own either.
{
  const rows = [{ name: "Mr David Tasker", dob: "04 August, 1975", phone: "0400000001" }];
  const referrals = [{ patientName: "Daniela Tasker", phones: ["0400000002"], dobs: ["1975-08-04"] }];
  assert.deepStrictEqual(matchBookings(rows, referrals), [], "same DOB and surname, different person");
}

// Two bookings for the same patient on the same day must BOTH be ticked,
// otherwise the second one looks outstanding.
{
  const rows = [
    { name: "Mrs Daniela Tasker", dob: "04 August, 1975", phone: "0408644474" },
    { name: "Mr Barry Towns", dob: "08 January, 1947", phone: "0419004421" },
    { name: "Mrs Daniela Tasker", dob: "04 August, 1975", phone: "0408644474" },
  ];
  const referrals = [{ patientName: "Daniela Tasker", phones: ["0408644474"], dobs: ["1975-08-04"] }];
  assert.deepStrictEqual(matchBookings(rows, referrals), [0, 2]);
}

// Unusable data is skipped rather than matched loosely
{
  assert.deepStrictEqual(
    matchBookings(
      [{ name: "Mrs Daniela Tasker", dob: null, phone: "123" }],
      [{ patientName: "Daniela Tasker", phones: ["123"], dobs: [] }],
    ),
    [],
    "too-short phone must not match",
  );

  assert.deepStrictEqual(
    matchBookings(
      [{ name: "Daniela Tasker", dob: "04 August, 1975", phone: "0408644474" }],
      [{ patientName: null, phones: ["0408644474"], dobs: ["1975-08-04"] }],
    ),
    [],
    "referral with no name must not match",
  );

  assert.deepStrictEqual(
    matchBookings(
      [{ name: "Daniela Tasker", dob: null, phone: null }],
      [{ patientName: "Daniela Tasker", phones: ["0408644474"], dobs: ["1975-08-04"] }],
    ),
    [],
    "a name with nothing to corroborate it must not match",
  );

  assert.deepStrictEqual(
    matchBookings(
      [{ name: "Daniela Tasker", dob: "04 August, 1975", phone: "0408644474" }],
      [{ patientName: "Daniela Tasker", phones: [null, ""], dobs: [null, undefined] }],
    ),
    [],
    "referral with no usable identifier must not match on name alone",
  );
}

console.log("All server/services/bookingMatch.ts tests passed.");
