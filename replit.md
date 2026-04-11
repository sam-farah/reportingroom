# Reporting Room - Medical Report Generation System

## Overview
Reporting Room is a comprehensive full-stack web application designed to automate the generation of medical reports using AI technology. The system allows users to upload ultrasound worksheets (both images and PDFs), process them using OCR and AI analysis, and generate professionally formatted medical reports with physician signatures. Key capabilities include global AI training based on scan-specific categories, comprehensive report amendment functionality with audit trails, and robust finalization with electronic signatures. The business vision is to provide a system-wide consistent medical terminology and reporting standards across all clinics and users.

## User Preferences
Preferred communication style: Simple, everyday language.

## DICOM Integration
- **Orthanc DICOM Server**: Accessible via Tailscale VPN at `100.108.175.83:8042`
- **DICOM panel** in the app (`/dicom` nav item) provides a launcher with three quick links:
  - **OHIF Viewer** (`/ui/app/`) — main study viewer
  - **Orthanc Explorer** (`/app/explorer.html`) — study management
  - **REST API** (`/`) — Orthanc index
- Not embeddable inline because Orthanc is HTTP and the app is HTTPS (mixed-content policy); opens in a new tab

## Pending Features
- **SMS Appointment Reminders**: Planned via Twilio (connector available: `connector:ccfg_twilio_01K69QJTED9YTJFE2SJ7E4SY08`). When ready, connect Twilio account and build a background scheduler that sends reminders 24h and 1h before appointments. Track `reminderSent` on appointment records to avoid duplicates. User deferred this feature.
- **Email Appointment Reminders (COMPLETE)**: Manual one-click reminder emails from the calendar appointment dialog. Uses SendGrid. Includes appointment date/time, duration, scan type, clinic address, embedded logo, and custom prep instructions. Setup: Admin → Clinic Settings → "Appointment Reminder — Preparation Instructions" card. Send via calendar → appointment detail → "Send Reminder" button (disabled if no patient email on file).
- **Public Clinic Registration with Payments**: When ready to onboard new clinics publicly, re-enable clinic registration at `/register-clinic` with a Stripe subscription payment step. Currently disabled — access is invitation-only. The `/register-clinic` route and backend exist but are hidden from the UI.
- **Referring Doctor & Copy-To in Booking (COMPLETE)**: Added `referringDoctorName`, `referringDoctorEmail`, `referringDoctorFax`, `copyToName`, `copyToEmail`, `copyToFax` columns to appointments schema. Calendar booking form has a "Referring Doctor" section (with autofill dropdown from saved referring doctors) and a "Copy To" section. When the Distribute dialog opens for a report with a linked patient, the patient's most recent appointment is fetched and those fields auto-populate the email To/Name, fax, and CC fields.

## System Architecture

### Frontend Architecture
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **UI Framework**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter
- **Styling**: Custom medical theme with CSS variables

**Rationale**: This modern React stack provides excellent developer experience, type safety, and performance. The shadcn/ui component library offers consistent, accessible UI components while Tailwind CSS enables rapid styling.

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for RESTful API endpoints
- **File Upload**: Multer middleware
- **Storage**: In-memory storage implementation with interface for future database integration
- **AI Integration**: OpenAI GPT-4o for OCR processing and report generation

**Rationale**: Express.js provides a lightweight, flexible foundation for the API. The in-memory storage allows for rapid prototyping while the interface pattern enables easy migration to persistent storage.

### Data Storage Solutions
- **Primary Database**: PostgreSQL (configured, future implementation)
- **ORM**: Drizzle ORM
- **Current Implementation**: In-memory storage with Map-based data structures
- **File Storage**: Dual-layer — local disk (fast) + PostgreSQL `file_blobs` table (permanent backup). Every uploaded file is saved to both. On serve, disk is tried first; DB is used as fallback and the file is restored to disk automatically. On startup, all existing disk files are backfilled to DB. This prevents file loss on server resets.

**Rationale**: Drizzle ORM provides excellent TypeScript integration and performance. PostgreSQL offers robust data integrity and querying capabilities for medical data.

### Authentication and Authorization
- **Authentication System**: Email/password with bcryptjs hashing (replaced Replit OIDC)
- **Auth Routes**: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/user`, `POST /api/auth/logout` — all in `server/auth.ts`
- **Session Management**: PostgreSQL-backed sessions with connect-pg-simple (`req.session.userId`)
- **Security**: Full authentication required for all API endpoints via `isAuthenticated` middleware
- **User Management**: Users created via email/password registration or invitation acceptance
- **Role-Based Access Control**: Three roles - `clinic_owner`, `admin`, `sonographer`
  - `clinic_owner`: Full access including Team management, Admin Panel, and invitations
  - `admin`: Same access as clinic_owner (can manage staff/invitations)
  - `sonographer`: Standard user access (upload, reports, templates, calendar, patients)
- **Multi-Tenant**: Each clinic is a separate tenant with its own staff, patients, and data
- **User Onboarding Flow**: New users without a clinic see onboarding page (register clinic or accept invitation)
- **Invitation System**: Owners/admins create invitation links; invitation page (`/invite/:token`) has tabs for "Create Account" or "Sign In" to accept

**Rationale**: Session-based email/password authentication for this medical application with full audit trails. Role-based access ensures proper data isolation between clinics.

### Key Components

#### User Panel
- **File Upload**: Drag-and-drop for worksheet uploads (images and PDFs)
- **OCR Processing**: Automatic patient data extraction
- **Report Generation**: AI-powered creation of structured medical reports
- **Report Preview**: Real-time preview with physician information
- **Export Options**: PDF and DOCX export with customizable styling
- **Report Design Templates**: Rich per-template visual customization — `primaryColor`, `accentColor`, `headerStyle` (left-logo/centered/compact), `sectionTitleStyle` (underline/filled/sidebar/pill/minimal), `patientBoxStyle` (card/table/minimal/banner), `fontFamily`, `fontSize`, `signaturePosition`, `showWorksheetInReport`. Styles applied to both PDF export and Distribute HTML output. Template editor uses card-picker UI for visual selection. Template list cards show colour swatches and style badges.

#### Admin Panel
- **Training Data Management**: Upload and categorize worksheet-report pairs for AI training (scan-specific types like "Lower Limb Venous", "Carotid Duplex", "Abdominal Aorta", "Post Endovenous Intervention")
- **Physician Management**: CRUD operations for physician profiles and signatures (file upload and stylus drawing)
- **Sonographer Management System**: Complete CRUD operations for sonographer profiles with initials matching integration
- **Clinic Information Management**: Comprehensive clinic settings form (name, address, phone, fax, email)

#### Calendar Events (Block-out / Recurring Events)
- **Events** are separate from appointments — used for blocking out theatre days, unavailability periods, etc.
- **Data model**: `calendar_events` table with `title`, `startTime`, `endTime`, `color` (purple/teal/orange/rose/indigo/amber), `recurrence` (none/weekly/monthly), `recurrenceEndDate`, `notes`, `clinicId`
- **Recurrence**: events are expanded client-side using `expandEvents()` for the visible date range — no server-side fan-out needed
- **Calendar display**: events render as colored semi-transparent blocks behind appointments in day/week views; colored pills in month view; clicking opens a detail/edit dialog
- **"Add Event" button** in the calendar header opens the event creation dialog
- **Cancelled appointments** are hidden from day/week/month grid views (only visible via the appointments query for history)
- **Hover tooltip** on appointment cards shows patient name, time, scan type, phone, and notes
- **Reschedule button** in the appointment viewing dialog opens the edit form (same as Edit but labeled for rescheduling)
- API: `GET/POST /api/calendar-events`, `PUT/DELETE /api/calendar-events/:id`

#### Report Distribution Log
- **Table**: `report_distributions` — tracks every distribution event per report
- **Fields**: `reportId`, `clinicId`, `method` (`email` | `copy_html`), `recipientName`, `recipientEmail`, `notes`, `sentAt`, `confirmedAt`, `confirmedBy`
- **Email sends**: auto-logged immediately after SendGrid confirms delivery (no user action needed)
- **Copy HTML**: after clicking "Copy HTML", a "Record this distribution" amber form slides in asking for recipient name/email/notes; clicking "Record Distribution" posts to `POST /api/reports/:id/distributions`
- **Distribution History**: shown at the bottom of the Distribute dialog — lists all past sends for that report with method icon, timestamp, recipient, and confirming user
- **API**: `GET /api/reports/:id/distributions`, `POST /api/reports/:id/distributions`

#### Referring Doctors & Scan Requests
- **Referring Doctors**: Clinic-scoped directory of referring GPs/specialists — name, practice, provider number, phone, fax, email, address. Searchable and reusable across requests.
- **Scan Requests**: Electronic referral form capturing patient details (linked to existing patients or free-text), referring doctor (linked or free-text), scan types (from canonical list), urgency (Routine/Urgent/ASAP/STAT), clinical indication, clinical history, notes, and status (Pending/Scheduled/Completed/Cancelled). Accessible from the "Requests" nav item.

#### Data Models
- **Users**: Authentication and profile management (email/password with `passwordHash` bcrypt field)
- **Physicians**: Doctor profiles with signatures and credentials
- **Worksheets**: Uploaded ultrasound images/PDFs with OCR-extracted metadata
- **Reports**: Generated medical reports with structured findings and impressions, including `patientUrNumber` (optional), amendment fields (`isAmended`, `amendedAt`, `amendedBy`, `amendmentReason`) and finalization fields (`isFinalized`, `finalizedAt`, `finalizedBy`)
- **Training Pairs**: Worksheet-report pairs for AI model training, including OCR text extraction for exact medical language replication.
- **Patients**: `urNumber` varchar(20) — auto-assigned sequential 6-digit numbers (starting from 100001) via `generateNextUrNumber(clinicId)`. Displayed throughout as `UR XXXXXX` badge in blue. Editable in the patient form.
- **Scan Requests**: Includes `patientUrNumber` varchar(20) — captured from the linked patient when selected, stored persistently, shown in the request list, form, viewing dialog, and printed PDF.

#### Data Flow
1. **Worksheet Upload**: User uploads ultrasound worksheet.
2. **OCR Processing**: OpenAI Vision API extracts patient information and medical language.
3. **Data Validation**: Extracted information is validated and can be manually corrected.
4. **Report Generation**: AI analyzes worksheet and generates structured medical report, replicating exact terminology from training data.
5. **Report Review**: Generated report is displayed for physician review and approval.
6. **Export/Storage**: Finalized reports are saved and can be exported.

## External Dependencies

### AI/ML Services
- **OpenAI API**: GPT-4o model for vision processing and text generation (OCR, medical report generation, structured output).

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting.
- **Connection**: `@neondatabase/serverless` driver.

### UI/UX Libraries
- **Radix UI**: Accessible, unstyled components.
- **Lucide React**: Consistent icon set.
- **React Hook Form**: Form validation and management.
- **Date-fns**: Date manipulation and formatting utilities.

### Development Tools
- **ESBuild**: Fast bundling for production.
- **TSX**: TypeScript execution for development.
- **Drizzle Kit**: Database migration and schema management.