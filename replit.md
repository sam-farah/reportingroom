# Reporting Room - Medical Report Generation System

## Overview

Reporting Room is a comprehensive full-stack web application designed to automate the generation of medical reports using AI technology. The system allows users to upload ultrasound worksheets (both images and PDFs), process them using OCR and AI analysis, and generate professionally formatted medical reports with physician signatures. The system now includes complete PDF processing capabilities and browser-based PDF generation for medical record keeping.

## Recent Changes

**July 26, 2025:**
- **Navigation Restructure** - Changed "Physicians" tab to "Clinic" and integrated staff management as separate tab within clinic section
- **Staff Management Integration** - Added dedicated staff tab between sonographers and settings with invitation and management functionality
- **Staff Invitation System Fix** - Corrected invitation creation API to properly handle email and role validation with database integration
- **Logo Positioning Update** - Moved full Reporting Room logo to bottom-right corner of dashboard for cleaner navigation appearance
- **Updated Reporting Room Branding** - Integrated new professional logo designs with icon-only and text versions across landing and dashboard
- **Report Amendment System** - Implemented comprehensive amendment functionality with audit trail tracking and automatic finalization reset
- **Amendment Database Schema** - Added `isAmended`, `amendedAt`, `amendedBy`, and `amendmentReason` fields for complete audit trail
- **Amendment API Endpoint** - Created `/api/reports/:id/amend` endpoint with reason validation and automatic finalization status reset
- **Amendment Dialog Interface** - Built dedicated amendment dialog with reason requirement and visual warning about finalization reset
- **Amendment Status Indicators** - Added orange amendment badges showing amendment date and visual markers in report cards
- **Finalization Reset Logic** - Amended reports automatically reset finalization status requiring re-signature for data integrity
- **Amendment Business Rule** - Amendment button only appears for finalized reports following proper medical documentation workflow
- **Report Finalization System** - Implemented comprehensive report finalization with electronic signature timestamps and checkbox controls
- **Database Schema Extension** - Added `isFinalized`, `finalizedAt`, and `finalizedBy` fields to reports table for audit trail
- **Dual Finalization Interface** - Added finalization checkboxes in both report preview and reporting room with visual status indicators
- **Electronic Signature Integration** - Finalized reports display "Electronically signed on [date]" in exports and UI
- **Finalization API Endpoints** - Created `/api/reports/:id/finalize` endpoint for secure report finalization with authentication
- **Visual Status Indicators** - Reports show green checkmark and signed date when finalized, with disabled editing for integrity
- **Enhanced Legend System with Dual Input Methods** - Implemented comprehensive legend entry system supporting both image upload and direct drawing capabilities for AI training
- **Drawing Canvas Integration** - Added interactive HTML5 canvas for sonographers to draw patterns directly in legend entries with real-time save functionality
- **Database Schema Enhancement** - Extended legend entries table with `drawingData`, `imageType`, and `exampleImage` fields to support both input methods
- **Server File Upload Support** - Updated legend entry API routes to handle multipart form data for image uploads using FormData
- **Visual Legend Display** - Enhanced legend entry cards to display uploaded images or drawn patterns with proper categorization and status indicators
- **TypeScript Form State Management** - Corrected legend form state structure to handle new fields with proper type safety and validation
- **Critical Digital Drawing Workflow Fixes** - Resolved duplicate API route definitions causing "not a valid HTTP method" errors
- **Backend Storage Interface Implementation** - Added missing digital worksheet CRUD operations to storage layer
- **API Parameter Ordering Correction** - Fixed apiRequest function parameter order for proper frontend-backend communication
- **Authentication Flow Debugging** - Ensured proper session handling and credentials passing for protected routes
- **Drawing Session Workflow Testing** - Validated complete template selection, patient entry, and draft report creation flow
- **Payload Size Optimization** - Fixed 413 "Request Entity Too Large" errors with 50MB body limits and JPEG compression
- **Photo Workflow Database Integration** - Resolved reports saving to database with proper authentication handling
- **Physician Signature Update Fix** - Corrected API parameter ordering in physician management for successful signature updates

**July 25, 2025:**
- **Application Rebranding** - Renamed from "JustScan" to "Reporting Room" across all interfaces and documentation
- **Comprehensive Reporting Room Feature** - Built complete report management system with pagination (12 reports per page)
- **Report Editing & Template Switching** - Full edit dialog with template selection and field modification capabilities
- **Dual Format Export System** - PDF and DOCX export with customizable styling based on selected templates
- **Advanced Pagination Controls** - Smart navigation with numbered pages, previous/next buttons, and search integration
- **Enhanced Search Functionality** - Filter reports by patient name or study type with automatic page reset
- **Professional UI Enhancement** - Improved grid layout supporting up to 4 columns on larger screens
- **Template System Integration** - Seamless connection between templates and report generation/editing
- **Standardized Export Formatting** - Unified PDF and DOCX report styling with consistent headers, sections, and professional layout
- **Dedicated Physician Management** - Separate page for managing physician profiles with CRUD operations and navigation integration
- **Advanced Signature System** - Dual signature options with file upload and stylus drawing capabilities for physician authentication
- **Sonographer Management System** - Complete CRUD operations for sonographer profiles with initials matching integration
- **Enhanced Camera Capture** - Portrait-mode camera with front/back camera switching, live preview, and direct worksheet photography

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite for fast development and optimized production builds
- **UI Framework**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for client-side routing
- **Styling**: Custom medical theme with CSS variables for consistent branding

**Rationale**: This modern React stack provides excellent developer experience, type safety, and performance. The shadcn/ui component library offers consistent, accessible UI components while Tailwind CSS enables rapid styling.

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for RESTful API endpoints
- **File Upload**: Multer middleware for handling multipart form data
- **Storage**: In-memory storage implementation with interface for future database integration
- **AI Integration**: OpenAI GPT-4o for OCR processing and report generation

**Rationale**: Express.js provides a lightweight, flexible foundation for the API. The in-memory storage allows for rapid prototyping while the interface pattern enables easy migration to persistent storage.

### Data Storage Solutions
- **Primary Database**: PostgreSQL (configured but not yet implemented)
- **ORM**: Drizzle ORM for type-safe database operations
- **Current Implementation**: In-memory storage with Map-based data structures
- **File Storage**: Local filesystem for uploaded worksheets and generated reports

**Rationale**: Drizzle ORM provides excellent TypeScript integration and performance. PostgreSQL offers robust data integrity and querying capabilities for medical data.

### Authentication and Authorization
- **Authentication System**: Replit OpenID Connect integration
- **Session Management**: PostgreSQL-backed sessions with connect-pg-simple
- **Security**: Full authentication required for all API endpoints
- **User Management**: Automatic user creation/updates via OpenID claims

**Rationale**: Session-based authentication is appropriate for this medical application where security and audit trails are critical.

## Key Components

### User Panel
- **File Upload**: Drag-and-drop interface for worksheet uploads
- **OCR Processing**: Automatic patient data extraction from uploaded images
- **Report Generation**: AI-powered creation of structured medical reports
- **Report Preview**: Real-time preview of generated reports with physician information
- **Export Options**: Download and print functionality for finalized reports

### Admin Panel
- **Training Data Management**: Upload and categorize worksheet-report pairs for AI training
- **Physician Management**: CRUD operations for physician profiles and signatures
- **System Analytics**: Performance metrics and usage statistics

### Data Models
- **Users**: Basic user authentication and profile management
- **Physicians**: Doctor profiles with signatures and credentials
- **Worksheets**: Uploaded ultrasound images with OCR-extracted metadata
- **Reports**: Generated medical reports with structured findings and impressions
- **Training Pairs**: Worksheet-report pairs for AI model training

## Data Flow

1. **Worksheet Upload**: User uploads ultrasound worksheet through file upload interface
2. **OCR Processing**: OpenAI Vision API extracts patient information (name, DOB, exam date)
3. **Data Validation**: Extracted information is validated and can be manually corrected
4. **Report Generation**: AI analyzes worksheet and generates structured medical report
5. **Report Review**: Generated report is displayed for physician review and approval
6. **Export/Storage**: Finalized reports are saved and can be exported in various formats

## External Dependencies

### AI/ML Services
- **OpenAI API**: GPT-4o model for vision processing and text generation
  - OCR capabilities for patient data extraction
  - Medical report generation from ultrasound findings
  - Structured output formatting

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting
- **Connection**: @neondatabase/serverless driver for optimal performance

### UI/UX Libraries
- **Radix UI**: Accessible, unstyled components as base for custom components
- **Lucide React**: Consistent icon set for medical and general UI elements
- **React Hook Form**: Form validation and management
- **Date-fns**: Date manipulation and formatting utilities

### Development Tools
- **ESBuild**: Fast bundling for production builds
- **TSX**: TypeScript execution for development
- **Drizzle Kit**: Database migration and schema management

## Deployment Strategy

### Development Environment
- **Local Development**: Vite dev server with HMR for frontend, TSX for backend
- **Database**: Local PostgreSQL or Neon development instance
- **File Storage**: Local filesystem with uploads directory

### Production Considerations
- **Build Process**: Vite builds frontend to static assets, ESBuild bundles backend
- **Environment Variables**: 
  - `DATABASE_URL`: PostgreSQL connection string
  - `OPENAI_API_KEY`: OpenAI API authentication
  - `NODE_ENV`: Environment specification
- **File Storage**: Consider cloud storage (S3/CloudFlare R2) for scalability
- **Database**: Neon PostgreSQL for production with connection pooling

### Security Considerations
- File upload validation and size limits (10MB)
- Environment variable protection for API keys
- Future implementation of proper authentication and authorization
- HIPAA compliance considerations for medical data handling

### Scalability
- Stateless backend design enables horizontal scaling
- Database queries optimized through Drizzle ORM
- File upload handling can be moved to cloud storage
- AI processing can be queued for high-volume scenarios