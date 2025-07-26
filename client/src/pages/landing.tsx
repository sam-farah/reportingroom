import { FileText, Brain, Shield, ChevronRight } from "lucide-react";
import logoWithTextPath from "@assets/Screenshot 2025-07-26 201206_1753524822283.png";
import logoIconPath from "@assets/Screenshot 2025-07-26 201200_1753524822284.png";
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
              <img 
                src={logoWithTextPath} 
                alt="Reporting Room" 
                className="h-10 w-auto"
              />
            </div>
            <Button onClick={handleLogin} className="medical-btn-primary">
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main>
        <div className="relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-teal-50"></div>
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
            <div className="text-center">
              {/* Logo Hero */}
              <div className="flex justify-center mb-8">
                <img 
                  src={logoWithTextPath} 
                  alt="Reporting Room" 
                  className="h-16 w-auto"
                />
              </div>
              
              <h1 className="text-5xl font-bold text-gray-900 sm:text-7xl leading-tight">
                AI-Powered Vascular Ultrasound
                <span className="block bg-gradient-to-r from-[var(--medical-primary)] to-[var(--medical-accent)] bg-clip-text text-transparent">
                  Report Generation
                </span>
              </h1>
              
              <p className="mt-8 text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                Transform your ultrasound worksheets into professional medical reports with our 
                advanced AI technology. Extract patient data, analyze findings, and generate 
                structured reports in seconds.
              </p>
              
              <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Button 
                  onClick={handleLogin} 
                  className="medical-btn-primary text-lg px-8 py-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                >
                  Start Creating Reports
                  <ChevronRight className="ml-2 w-5 h-5" />
                </Button>
                <Button 
                  variant="outline" 
                  className="text-lg px-8 py-4 rounded-full border-2 border-gray-300 hover:border-[var(--medical-primary)] transition-colors"
                  onClick={() => window.location.href = "/register-clinic"}
                >
                  Register Your Clinic
                </Button>
              </div>
              
              {/* Trust Indicators */}
              <div className="mt-16 flex flex-col items-center">
                <p className="text-sm text-gray-500 mb-4">Trusted by medical professionals worldwide</p>
                <div className="flex items-center space-x-8 text-gray-400">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-5 h-5" />
                    <span className="text-sm">HIPAA Compliant</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Brain className="w-5 h-5" />
                    <span className="text-sm">AI-Powered</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <FileText className="w-5 h-5" />
                    <span className="text-sm">Professional Reports</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                Everything you need for medical reporting
              </h2>
              <p className="mt-4 text-xl text-gray-600">
                Streamline your workflow with powerful AI-driven features designed for healthcare professionals.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-[var(--medical-primary)] to-[var(--medical-accent)] rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Brain className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">Smart OCR Technology</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Advanced AI reads handwritten patient information from ultrasound worksheets with 
                    industry-leading accuracy and speed.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-[var(--medical-primary)] to-[var(--medical-accent)] rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <FileText className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">Professional Reports</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Generate structured medical reports with physician signatures, custom templates, 
                    and professional formatting automatically.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-[var(--medical-primary)] to-[var(--medical-accent)] rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Shield className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">HIPAA Compliant</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Your patient data is protected with enterprise-grade security, encryption, 
                    and full HIPAA compliance standards.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* How it Works */}
        <div className="py-24 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl mb-4">
                How Reporting Room Works
              </h2>
              <p className="text-xl text-gray-600">
                Three simple steps to transform your workflow
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <div className="text-center">
                <div className="w-20 h-20 bg-gradient-to-r from-[var(--medical-primary)] to-[var(--medical-accent)] rounded-full flex items-center justify-center mx-auto mb-6 text-white font-bold text-2xl shadow-lg">
                  1
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Upload Worksheet</h3>
                <p className="text-gray-600 leading-relaxed">
                  Simply drag and drop your ultrasound worksheet image or PDF into the system for instant processing.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-20 h-20 bg-gradient-to-r from-[var(--medical-primary)] to-[var(--medical-accent)] rounded-full flex items-center justify-center mx-auto mb-6 text-white font-bold text-2xl shadow-lg">
                  2
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">AI Processing</h3>
                <p className="text-gray-600 leading-relaxed">
                  Our advanced AI extracts patient data and analyzes ultrasound findings with medical-grade accuracy.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-20 h-20 bg-gradient-to-r from-[var(--medical-primary)] to-[var(--medical-accent)] rounded-full flex items-center justify-center mx-auto mb-6 text-white font-bold text-2xl shadow-lg">
                  3
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Generate Report</h3>
                <p className="text-gray-600 leading-relaxed">
                  Get a professionally formatted medical report ready for physician review and electronic signature.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="py-24 bg-gradient-to-r from-[var(--medical-primary)] to-[var(--medical-accent)]">
          <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-white sm:text-4xl mb-6">
              Ready to transform your medical reporting?
            </h2>
            <p className="text-xl text-blue-100 mb-8">
              Join thousands of healthcare professionals who trust Reporting Room for their ultrasound reporting needs.
            </p>
            <Button 
              onClick={handleLogin}
              className="bg-white text-[var(--medical-primary)] hover:bg-gray-100 text-lg px-8 py-4 rounded-full font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              Get Started Today
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <img 
              src={logoIconPath} 
              alt="Reporting Room" 
              className="h-8 w-8 mx-auto mb-4 filter brightness-0 invert"
            />
            <p className="text-gray-400">
              © 2025 Reporting Room. Transforming medical reporting with AI technology.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}