import { HeartPulse, FileText, Brain, Shield, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <HeartPulse className="text-[var(--medical-primary)] text-2xl mr-3" />
              <span className="text-xl font-semibold text-gray-900">JustScan</span>
            </div>
            <Button onClick={handleLogin} className="medical-btn-primary">
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 sm:text-6xl">
              AI-Powered Ultrasound
              <span className="block text-[var(--medical-primary)]">Report Generation</span>
            </h1>
            <p className="mt-6 text-xl text-gray-600 max-w-3xl mx-auto">
              Upload your ultrasound worksheets and let our advanced AI extract patient information 
              and generate professional medical reports automatically.
            </p>
            <div className="mt-10">
              <Button 
                onClick={handleLogin} 
                className="medical-btn-primary text-lg px-8 py-3"
              >
                Get Started
                <ChevronRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Features */}
          <div className="mt-20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card>
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-[var(--medical-primary)] bg-opacity-10 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Brain className="w-6 h-6 text-[var(--medical-primary)]" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Smart OCR Technology</h3>
                  <p className="text-gray-600">
                    Advanced AI reads handwritten patient information from ultrasound worksheets with high accuracy.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-[var(--medical-primary)] bg-opacity-10 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-6 h-6 text-[var(--medical-primary)]" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Professional Reports</h3>
                  <p className="text-gray-600">
                    Generate structured medical reports with physician signatures and custom logos automatically.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-[var(--medical-primary)] bg-opacity-10 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-6 h-6 text-[var(--medical-primary)]" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Secure & Compliant</h3>
                  <p className="text-gray-600">
                    Built with medical data security in mind, ensuring patient information remains protected.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* How it Works */}
          <div className="mt-20">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">How JustScan Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-[var(--medical-primary)] rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
                  1
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Worksheet</h3>
                <p className="text-gray-600">
                  Simply drag and drop your ultrasound worksheet image or PDF into the system.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-[var(--medical-primary)] rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
                  2
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Processing</h3>
                <p className="text-gray-600">
                  Our AI extracts patient data and analyzes the ultrasound findings automatically.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-[var(--medical-primary)] rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
                  3
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Generate Report</h3>
                <p className="text-gray-600">
                  Get a professional medical report ready for physician review and signature.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-600">
            <p>&copy; 2024 JustScan. AI-powered medical reporting made simple.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}