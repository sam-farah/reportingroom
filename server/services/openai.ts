import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is not set");
}

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
});

export interface OCRResult {
  patientName: string | null;
  patientDob: string | null;
  examDate: string | null;
  confidence: number;
}

export interface ReportData {
  patientName: string;
  patientDob: string;
  examDate: string;
  studyType: string;
  indication: string;
  findings: string;
  impression: string;
}

export async function extractPatientDataFromWorksheet(base64Image: string, isFromPdf: boolean = false): Promise<OCRResult> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert medical OCR system. Extract patient information from ultrasound worksheets. 
          Focus on finding:
          - Patient name (look for "Patient:", "Name:", or similar labels)
          - Date of birth (look for "DOB:", "Date of Birth:", or similar - commonly in DD-MM-YY or DD/MM/YY format)
          - Exam date (look for "Date:", "Exam Date:", or current date)
          
          IMPORTANT for dates:
          - For DOB: Extract exactly as written (e.g., "22-7-52", "15/03/85") 
          - For exam dates: Extract exactly as written (e.g., "17-7-23", "05.12.24")
          - Do not convert or reformat dates - preserve original format
          - Handle 2-digit years correctly (52 = 1952, 23 = 2023)
          
          Return JSON with: { "patientName": string|null, "patientDob": string|null, "examDate": string|null, "confidence": number }
          
          If text is unclear or not found, return null for that field. Confidence should be 0-1.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract patient information from this ultrasound worksheet:"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/${isFromPdf ? 'png' : 'jpeg'};base64,${base64Image}`
              }
            }
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      patientName: result.patientName || null,
      patientDob: result.patientDob || null,
      examDate: result.examDate || null,
      confidence: Math.max(0, Math.min(1, result.confidence || 0))
    };
  } catch (error) {
    console.error("OCR extraction failed:", error);
    throw new Error("Failed to extract patient data from worksheet");
  }
}

export async function analyzeVascularDrawing(
  base64Image: string,
  templateName: string = 'Custom',
  studyType: string = 'Vascular Study'
): Promise<{ findings: string; impression: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert vascular sonographer reviewing digital drawings on ultrasound templates. 

          Analyze the drawing annotations, markings, and measurements made on this ${templateName} template.
          
          Focus on:
          - Vessel anatomy and patency indicated by drawings
          - Flow patterns shown by arrows or directional markings
          - Measurements and annotations made by the sonographer
          - Areas of interest highlighted or circled
          - Compression test results if indicated
          - Any abnormal findings marked or noted
          
          Generate professional medical findings and impression based on what is actually drawn.
          
          Return JSON format: { "findings": "detailed technical findings", "impression": "clinical summary and recommendations" }
          
          Make findings specific to what you can see drawn, not generic template text.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this ${templateName} drawing for ${studyType}. Describe what the sonographer has marked, measured, or highlighted:`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1500
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      findings: result.findings || "Digital drawing analysis could not be completed. Manual review recommended.",
      impression: result.impression || "Drawing requires physician interpretation. Clinical correlation recommended."
    };
  } catch (error) {
    console.error("Drawing analysis failed:", error);
    throw new Error("Failed to analyze vascular drawing");
  }
}

export async function generateReportFromWorksheet(
  base64Image: string, 
  extractedData: OCRResult,
  trainingData: any[] = [],
  isFromPdf: boolean = false
): Promise<ReportData> {
  try {
    const trainingContext = trainingData.length > 0 
      ? `\n\nReference training examples:\n${trainingData.map(t => `Category: ${t.category}\nComplexity: ${t.complexityLevel}`).join('\n')}`
      : '';

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert radiologist AI assistant. Generate a professional ultrasound report based on the worksheet image and extracted patient data.

          Use this structure:
          - Study Type: (e.g., "Abdominal Ultrasound", "Pelvic Ultrasound")
          - Indication: (reason for exam)
          - Findings: (detailed observations, multiple paragraphs)
          - Impression: (concise summary and conclusions)

          Write in professional medical language. Be thorough but concise.
          
          Return JSON with: {
            "studyType": string,
            "indication": string, 
            "findings": string,
            "impression": string
          }${trainingContext}`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Generate a report for this ultrasound worksheet. 
              Patient: ${extractedData.patientName || 'Not specified'}
              DOB: ${extractedData.patientDob || 'Not specified'}
              Exam Date: ${extractedData.examDate || new Date().toLocaleDateString()}`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/${isFromPdf ? 'png' : 'jpeg'};base64,${base64Image}`
              }
            }
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1500,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      patientName: extractedData.patientName || "Not specified",
      patientDob: extractedData.patientDob || "Not specified",
      examDate: extractedData.examDate || new Date().toLocaleDateString(),
      studyType: result.studyType || "Ultrasound Examination",
      indication: result.indication || "Clinical evaluation",
      findings: result.findings || "No significant findings documented.",
      impression: result.impression || "Further evaluation may be needed."
    };
  } catch (error) {
    console.error("Report generation failed:", error);
    throw new Error("Failed to generate report from worksheet");
  }
}
