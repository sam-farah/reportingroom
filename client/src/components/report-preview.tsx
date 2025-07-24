import { Image } from "lucide-react";
import type { Report, Physician } from "@shared/schema";

interface ReportPreviewProps {
  report: Report | null;
  physician?: Physician;
  logoFile?: File | null;
}

export default function ReportPreview({ report, physician, logoFile }: ReportPreviewProps) {
  if (!report) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 min-h-96 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Image className="w-8 h-8 text-gray-400" />
          </div>
          <p>Upload a worksheet and generate a report to see the preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8 min-h-96">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
            {logoFile ? (
              <img 
                src={URL.createObjectURL(logoFile)} 
                alt="Logo" 
                className="w-full h-full object-contain rounded-lg"
              />
            ) : (
              <Image className="w-8 h-8 text-gray-400" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Medical Center Name</h3>
            <p className="text-sm text-gray-600">Ultrasound Report</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">
            Report Date: {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Patient Information */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <h4 className="font-semibold text-gray-900 mb-2">Patient Information</h4>
          <div className="text-sm space-y-1">
            <p><span className="font-medium">Name:</span> {report.patientName}</p>
            <p><span className="font-medium">DOB:</span> {report.patientDob}</p>
            <p><span className="font-medium">Exam Date:</span> {report.examDate}</p>
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-gray-900 mb-2">Study Information</h4>
          <div className="text-sm space-y-1">
            <p><span className="font-medium">Study Type:</span> {report.studyType}</p>
            <p><span className="font-medium">Indication:</span> {report.indication}</p>
          </div>
        </div>
      </div>

      {/* Findings */}
      <div className="mb-6">
        <h4 className="font-semibold text-gray-900 mb-3">Findings</h4>
        <div className="text-sm text-gray-700 whitespace-pre-wrap">
          {report.findings}
        </div>
      </div>

      {/* Impression */}
      <div className="mb-8">
        <h4 className="font-semibold text-gray-900 mb-3">Impression</h4>
        <div className="text-sm text-gray-700 whitespace-pre-wrap">
          {report.impression}
        </div>
      </div>

      {/* Signature */}
      <div className="border-t pt-6">
        <div className="flex justify-end">
          <div className="text-right">
            <div className="w-48 h-16 bg-gray-100 rounded mb-2 flex items-center justify-center">
              <span className="text-xs text-gray-500">Digital Signature</span>
            </div>
            <p className="text-sm font-medium">
              {physician ? `${physician.name}, ${physician.title}` : "Dr. [Physician Name]"}
            </p>
            <p className="text-xs text-gray-600">
              {physician?.specialty || "Radiologist"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
