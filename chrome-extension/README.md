# ReportingRoom Scan Request — Chrome Extension

Reads patient details off the current page (e.g. Clinic to Cloud) and saves a
scan request straight into ReportingRoom. If the patient's name + DOB (or
name + mobile) match an existing patient, the request is linked to their file
automatically; otherwise it lands on the Requests page for linking.

## Install (each staff computer)

1. Download this `chrome-extension` folder to the computer.
2. Open Chrome → `chrome://extensions`
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `chrome-extension` folder.
5. Pin the extension (puzzle-piece icon → pin).

## Use

1. Open the patient's screen in Clinic to Cloud.
2. Click the extension icon. Sign in with your normal staff login
   (password + SMS code) — it stays signed in afterwards.
3. It auto-reads the patient's name, DOB, mobile and email from the page.
   If something's missed, highlight the patient details on the page and
   click **Read patient from this page**.
4. Pick the scan type and urgency, add clinical notes, then
   **Save Request to ReportingRoom**.

The request appears on the Requests page immediately, already linked to the
patient's file when an exact match is found.

## Referral ticks on the scheduler

On the Clinic to Cloud scheduler the extension marks every booking that already
has a referral for the day you are looking at with a small **red tick** in the
bottom-right of the row. No tick means no referral has been entered for that day.

A pill in the bottom-right corner of the screen always says which date the ticks
refer to, and how many of the bookings on screen are covered. Read it — if it
says anything other than the day you are viewing, the ticks cannot be trusted.
It also tells you when nobody is signed in or the check failed, because an
absence of ticks must never be mistaken for "nothing left to do".

Ticks only appear in **Day view**, since a tick is only meaningful against one
particular day.

A booking is matched when the **name agrees** and then **either the date of birth
or the mobile number** agrees as well. Needing a second identifier is deliberate:
a tick on a booking that was never referred would cause someone to skip real
work, whereas a missing tick only prompts a manual check. Households share phone
numbers and families share surnames, so neither is trusted on its own.

Only the name, date of birth and mobile shown on the scheduler are sent to
ReportingRoom, and the reply contains nothing but which rows matched.
