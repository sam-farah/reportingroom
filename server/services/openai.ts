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

export async function extractTextFromImage(base64Image: string): Promise<{ extractedText: string }> {
  try {
    console.log("🔍 Starting OCR text extraction from training report...");
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an OCR text extraction specialist. Extract ALL visible text from this medical report image, maintaining the original structure, spacing, and medical terminology exactly as written.

          EXTRACTION REQUIREMENTS:
          - Extract every word, number, and punctuation mark visible in the image
          - Preserve the original formatting, line breaks, and spacing as much as possible
          - Include medical terminology, measurements, abbreviations exactly as shown
          - Do not interpret or modify the text - extract exactly what you see
          - Include headers, body text, footnotes, and any annotations
          - Maintain the logical flow and structure of the original document
          
          Return JSON format: { "extractedText": "complete extracted text here" }`
        },
        {
          role: "user", 
          content: [
            {
              type: "text",
              text: "Extract all visible text from this medical report image, preserving exact formatting and terminology:"
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
      max_tokens: 2000
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    const extractedText = result.extractedText || "";
    
    console.log(`✅ OCR extraction completed: ${extractedText.length} characters extracted`);
    return { extractedText };
    
  } catch (error) {
    console.error("❌ OCR text extraction failed:", error);
    return { extractedText: "" };
  }
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
  studyType: string = 'Vascular Study',
  legendEntries: any[] = []
): Promise<{ findings: string; impression: string }> {
  try {
    const legendSection = legendEntries.length > 0
      ? `LEGEND REFERENCE for interpreting symbols:\n${legendEntries.map(e => `- ${e.category}: ${e.description} (${e.imageType === 'drawing' ? 'drawn pattern' : 'image reference'})`).join('\n')}\n\nUse this legend to interpret any symbols, patterns, or markings you see in the drawing.`
      : '';

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert vascular sonographer reviewing digital drawings on ultrasound templates. 

Analyze the drawing annotations, markings, and measurements made on this ${templateName} template.

CRITICAL — RADIOLOGICAL CONVENTION FOR BILATERAL VASCULAR STUDIES:
Vascular ultrasound worksheets follow standard radiological convention:
- The LEFT side of the image = the patient's RIGHT side
- The RIGHT side of the image = the patient's LEFT side
This applies to all bilateral anatomy diagrams (carotid, aorto-iliac, iliac veins, etc.).
If the worksheet contains a table with explicit "RIGHT" and "LEFT" column headers, those labels are authoritative — always use them to determine which side findings belong to, rather than relying on diagram orientation alone.
Never call a finding "left-sided" solely because it appears on the left of the image.

${legendSection}

Focus on:
- Vessel anatomy and patency indicated by drawings
- Flow patterns shown by arrows or directional markings  
- Measurements and annotations made by the sonographer
- Areas of interest highlighted or circled
- Compression test results if indicated
- Any abnormal findings marked or noted
- Symbol interpretation using the provided legend reference

Generate professional medical findings and impression based on what is actually drawn.

Return JSON format: { "findings": "detailed technical findings", "impression": "clinical summary and recommendations" }

Make findings specific to what you can see drawn, referencing legend symbols when applicable.`
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
  isFromPdf: boolean = false,
  contentTemplate: { findingsTemplate?: string | null; impressionTemplate?: string | null; indicationTemplate?: string | null } | null = null
): Promise<ReportData> {
  try {
    // --- Style reference from training data ---
    // We show the AI the clinic's preferred language and phrasing, but NOT as findings to copy.
    let trainingStyleSection = '';
    if (trainingData.length > 0) {
      const sampleTexts = trainingData
        .slice(0, 3)
        .filter(p => p.extractedReportText)
        .map((p, i) => {
          const preview = p.extractedReportText.substring(0, 400);
          const ellipsis = p.extractedReportText.length > 400 ? '…' : '';
          return `Example ${i + 1} (${p.category}, ${p.complexityLevel}):\n"${preview}${ellipsis}"`;
        })
        .join('\n\n');

      if (sampleTexts) {
        trainingStyleSection = `\n\nCLINIC STYLE REFERENCE (${trainingData.length} training reports):\nThe excerpts below show this clinic's preferred terminology, sentence structure, and reporting style. Adopt this style where it naturally fits what you observe on the actual worksheet — do not copy findings or diagnoses from these examples unless they are genuinely supported by the current image:\n\n${sampleTexts}`;
      } else {
        trainingStyleSection = `\n\nCLINIC STYLE REFERENCE: ${trainingData.length} training reports are available for style guidance. Follow professional vascular ultrasound reporting conventions.`;
      }
      console.log(`Style reference: ${trainingData.length} training examples`);
    }

    // --- Content template: structure and language guide only ---
    let templateSection = '';
    if (contentTemplate && (contentTemplate.findingsTemplate || contentTemplate.impressionTemplate || contentTemplate.indicationTemplate)) {
      const parts: string[] = [];
      if (contentTemplate.indicationTemplate) {
        parts.push(`Indication phrasing example:\n"${contentTemplate.indicationTemplate}"`);
      }
      if (contentTemplate.findingsTemplate) {
        parts.push(`Findings structure example:\n"${contentTemplate.findingsTemplate}"`);
      }
      if (contentTemplate.impressionTemplate) {
        parts.push(`Impression phrasing example:\n"${contentTemplate.impressionTemplate}"`);
      }
      templateSection = `\n\nCLINIC REPORT TEMPLATE (language and structure guide):\nThe following shows this clinic's standard phrasing for this scan type. Use it as a style reference — replace every value with what you actually observe on the worksheet, add sections for findings not covered, and omit sections that do not apply:\n\n${parts.join('\n\n')}`;
      console.log('Content template injected as style guide');
    }

    console.log(`Generating report | training examples: ${trainingData.length} | template: ${!!templateSection}`);

    const systemPrompt = `You are an expert radiologist AI assistant generating a professional vascular ultrasound report from a scanned worksheet image.

YOUR FIRST PRIORITY is to carefully read and analyse the actual worksheet image provided. Everything you report must be grounded in what you can directly observe in the image — measurements written on the worksheet, tick-boxes that are marked, waveform annotations, written notes, and any values or findings the sonographer has recorded.

RADIOLOGICAL CONVENTION — BILATERAL STUDIES:
Vascular worksheets use standard radiological convention:
- LEFT side of the image = patient's RIGHT side
- RIGHT side of the image = patient's LEFT side
If the worksheet has explicit "RIGHT" and "LEFT" column headers in a table, those labels are authoritative. Do not infer laterality from diagram position alone.

REPORT STRUCTURE:
- studyType: identify the scan type from the worksheet (e.g. "Lower Limb Venous Duplex", "Carotid Duplex Ultrasound")
- indication: the clinical reason for the exam as shown or implied on the worksheet
- findings: structured, specific observations — all vessels examined, measurements, compressibility, flow characteristics, any abnormalities
- impression: concise clinical summary with clear conclusions and recommended follow-up if appropriate

ACCURACY RULES:
- Report only what is visible on the worksheet; do not invent or assume findings
- If a field on the worksheet is blank or illegible, omit that detail rather than guessing
- Do not reproduce boilerplate from style references unless the worksheet genuinely supports it
- Distinguish clearly between normal and abnormal findings
${templateSection}${trainingStyleSection}

Return JSON: { "studyType": string, "indication": string, "findings": string, "impression": string }`;

    const userPrompt = `Please generate a report for this worksheet.

Patient: ${extractedData.patientName || 'Not specified'}
DOB: ${extractedData.patientDob || 'Not specified'}
Exam date: ${extractedData.examDate || new Date().toLocaleDateString()}

Carefully read all visible markings, measurements, annotations, tick-boxes, and written values on the worksheet, then produce the report based on what you actually see.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
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
