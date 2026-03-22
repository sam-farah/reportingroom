import { HelpCircle, PlayCircle, BookOpen, MessageCircle, Video } from "lucide-react";

const CATEGORIES = [
  {
    icon: Video,
    title: "Getting Started",
    description: "Learn the basics — uploading worksheets, generating reports, and navigating the system.",
    count: 4,
  },
  {
    icon: PlayCircle,
    title: "Report Generation & Editing",
    description: "How to generate, review, amend, and finalise reports with electronic signatures.",
    count: 6,
  },
  {
    icon: BookOpen,
    title: "Distributing Reports",
    description: "Sending reports via email, copying HTML for Helix/Medical Objects, and tracking distribution history.",
    count: 3,
  },
  {
    icon: MessageCircle,
    title: "Calendar & Appointments",
    description: "Booking appointments, managing scan requests, and setting up recurring events.",
    count: 5,
  },
];

export default function HelpCentre() {
  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
            <HelpCircle className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Help Centre</h1>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Video tutorials and guides for Reporting Room are on their way. Check back soon.
          </p>
        </div>

        {/* Coming Soon Banner */}
        <div className="bg-white border border-blue-100 rounded-xl p-6 mb-10 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Video className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800 mb-1">Video Tutorials — Coming Soon</h2>
            <p className="text-sm text-gray-500">
              We're producing a library of short video walkthroughs covering every feature in Reporting Room.
              They'll appear here as they're published, organised by topic so you can find what you need quickly.
            </p>
          </div>
        </div>

        {/* Category placeholders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.title}
                className="bg-white border border-gray-100 rounded-xl p-6 opacity-50 select-none"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-700 text-sm">{cat.title}</h3>
                    <span className="text-xs text-gray-400">{cat.count} videos</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{cat.description}</p>
                <div className="mt-4 space-y-2">
                  {Array.from({ length: Math.min(cat.count, 3) }).map((_, i) => (
                    <div key={i} className="h-8 bg-gray-100 rounded-lg" />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-400 mt-10">
          Need help in the meantime? Contact your clinic administrator or reach us at{" "}
          <span className="text-blue-400">support@reportingroom.net</span>
        </p>

      </div>
    </div>
  );
}
