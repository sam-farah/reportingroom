# Reporting Room - Medical Report Generation System

## Overview
Reporting Room is a comprehensive full-stack web application designed to automate the generation of medical reports using AI technology. The system allows users to upload ultrasound worksheets (both images and PDFs), process them using OCR and AI analysis, and generate professionally formatted medical reports with physician signatures. Key capabilities include global AI training based on scan-specific categories, comprehensive report amendment functionality with audit trails, and robust finalization with electronic signatures. The business vision is to provide a system-wide consistent medical terminology and reporting standards across all clinics and users.

## User Preferences
Preferred communication style: Simple, everyday language.

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
- **File Storage**: Local filesystem for uploaded worksheets and generated reports

**Rationale**: Drizzle ORM provides excellent TypeScript integration and performance. PostgreSQL offers robust data integrity and querying capabilities for medical data.

### Authentication and Authorization
- **Authentication System**: Replit OpenID Connect integration
- **Session Management**: PostgreSQL-backed sessions with connect-pg-simple
- **Security**: Full authentication required for all API endpoints
- **User Management**: Automatic user creation/updates via OpenID claims (preserves existing role/clinicId on login)
- **Role-Based Access Control**: Three roles - `clinic_owner`, `admin`, `sonographer`
  - `clinic_owner`: Full access including Team management, Admin Panel, and invitations
  - `admin`: Same access as clinic_owner (can manage staff/invitations)
  - `sonographer`: Standard user access (upload, reports, templates, calendar, patients)
- **Multi-Tenant**: Each clinic is a separate tenant with its own staff, patients, and data
- **User Onboarding Flow**: New users without a clinic see onboarding page (register clinic or accept invitation)
- **Invitation System**: Owners/admins create invitation links that new users can accept to join the clinic

**Rationale**: Session-based authentication is appropriate for this medical application where security and audit trails are critical. Role-based access ensures proper data isolation between clinics.

### Key Components

#### User Panel
- **File Upload**: Drag-and-drop for worksheet uploads (images and PDFs)
- **OCR Processing**: Automatic patient data extraction
- **Report Generation**: AI-powered creation of structured medical reports
- **Report Preview**: Real-time preview with physician information
- **Export Options**: PDF and DOCX export with customizable styling

#### Admin Panel
- **Training Data Management**: Upload and categorize worksheet-report pairs for AI training (scan-specific types like "Lower Limb Venous", "Carotid Duplex", "Abdominal Aorta", "Post Endovenous Intervention")
- **Physician Management**: CRUD operations for physician profiles and signatures (file upload and stylus drawing)
- **Sonographer Management System**: Complete CRUD operations for sonographer profiles with initials matching integration
- **Clinic Information Management**: Comprehensive clinic settings form (name, address, phone, fax, email)

#### Data Models
- **Users**: Authentication and profile management
- **Physicians**: Doctor profiles with signatures and credentials
- **Worksheets**: Uploaded ultrasound images/PDFs with OCR-extracted metadata
- **Reports**: Generated medical reports with structured findings and impressions, including amendment fields (`isAmended`, `amendedAt`, `amendedBy`, `amendmentReason`) and finalization fields (`isFinalized`, `finalizedAt`, `finalizedBy`)
- **Training Pairs**: Worksheet-report pairs for AI model training, including OCR text extraction for exact medical language replication.

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