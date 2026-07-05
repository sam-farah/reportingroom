# Email Appointment Reminders & Referring Doctor / Copy-To Booking Fields

## Email Appointment Reminders
Status: COMPLETE. Manual one-click reminder emails from the calendar appointment dialog. Uses SendGrid. Includes appointment date/time, duration, scan type, clinic address, embedded logo, and custom prep instructions. Setup: Admin → Clinic Settings → "Appointment Reminder — Preparation Instructions" card. Send via calendar → appointment detail → "Send Reminder" button (disabled if no patient email on file).

## Referring Doctor & Copy-To in Booking
Status: COMPLETE. Added `referringDoctorName`, `referringDoctorEmail`, `referringDoctorFax`, `copyToName`, `copyToEmail`, `copyToFax` columns to appointments schema. Calendar booking form has a "Referring Doctor" section (with autofill dropdown from saved referring doctors) and a "Copy To" section. When the Distribute dialog opens for a report with a linked patient, the patient's most recent appointment is fetched and those fields auto-populate the email To/Name, fax, and CC fields.
