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
