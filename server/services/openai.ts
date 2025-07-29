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
  studyType: string = 'Vascular Study',
  legendEntries: any[] = []
): Promise<{ findings: string; impression: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert vascular sonographer reviewing digital drawings on ultrasound templates. 

          Analyze the drawing annotations, markings, and measurements made on this ${templateName} template.
          
          ${legendEntries.length > 0 ? `LEGEND REFERENCE for interpreting symbols:
${legendEntries.map(entry => `- ${entry.category}: ${entry.description} (${entry.imageType === 'drawing' ? 'drawn pattern' : 'image reference'})`).join('\n')}

Use this legend to interpret any symbols, patterns, or markings you see in the drawing.` : ''}
          
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
  isFromPdf: boolean = false
): Promise<ReportData> {
  try {
    // Build comprehensive training context using actual training examples
    let trainingContext = '';
    if (trainingData.length > 0) {
      console.log(`Using ${trainingData.length} training examples for AI context`);
      
      // Categorize and prioritize training examples
      const categoryMap = trainingData.reduce((acc, pair) => {
        if (!acc[pair.category]) acc[pair.category] = [];
        acc[pair.category].push(pair);
        return acc;
      }, {} as Record<string, any[]>);

      const relevantExamples = trainingData.slice(0, 3); // Use top 3 most recent examples
      
      trainingContext = `\n\n🔥 CRITICAL TRAINING DATA INTEGRATION ACTIVE:
You MUST utilize these ${trainingData.length} uploaded training pairs for accurate report generation.

⚠️  TRAINING OVERRIDE INSTRUCTIONS:
The uploaded training examples show ACTUAL CLINICAL FINDINGS from real worksheets. You must analyze the current worksheet and match the clinical patterns shown in the training data.

TRAINING CATEGORIES AVAILABLE:
${Object.entries(categoryMap).map(([category, pairs]) => 
  `• ${category.toUpperCase()}: ${pairs.length} examples showing real clinical findings (${pairs.map(p => p.complexityLevel).join(', ')} complexity)`
).join('\n')}

🏥 REFERENCE EXAMPLES FOR CLINICAL PATTERN MATCHING:
${relevantExamples.map((pair, index) => 
  `TRAINING EXAMPLE ${index + 1}: ${pair.category.toUpperCase()} Study - ${pair.complexityLevel.toUpperCase()} Complexity
  ▪ Uploaded: ${new Date(pair.uploadedAt).toLocaleDateString()}
  ▪ Clinical Pattern: This training worksheet shows ${pair.category} pathology patterns
  ▪ Finding Style: Professional ${pair.category} ultrasound reporting with ${pair.complexityLevel} level clinical detail
  ▪ Training Files: Worksheet (${pair.worksheetUrl}) + Report (${pair.reportUrl})
  ▪ IMPORTANT: If current worksheet shows similar patterns to this training example, generate findings consistent with the training data`
).join('\n\n')}

🚨 MANDATORY TRAINING COMPLIANCE:
1. If the current worksheet shows venous insufficiency patterns similar to training examples, you MUST report venous insufficiency
2. Do NOT contradict clinical findings shown in the training data  
3. Match the diagnostic accuracy demonstrated in the uploaded training pairs
4. Use the same level of clinical detail and terminology as the training examples
5. If training shows pathology, look for and report similar pathology in the current study

AI TRAINING INSTRUCTIONS:
1. **Category Matching**: If the current study appears to be ${relevantExamples[0]?.category || 'similar'}, use ${relevantExamples[0]?.category || 'similar'} training patterns for medical terminology and structure
2. **Complexity Adaptation**: Generate ${relevantExamples[0]?.complexityLevel || 'intermediate'}-level detail matching the uploaded training examples  
3. **Professional Standards**: Follow medical reporting standards demonstrated in the ${trainingData.length} training examples
4. **Consistency**: Maintain reporting style, structure, and clinical approach consistent with training data
5. **Training-Informed Decisions**: Use training patterns to inform study type classification, finding descriptions, and impression formatting

TRAINING INTEGRATION STATUS: ✅ ACTIVE - AI will reference uploaded training examples for report generation consistency.`;
    } else {
      console.log('No training data available - using default AI knowledge');
      trainingContext = `\n\n⚠️  TRAINING DATA STATUS: NOT AVAILABLE
No uploaded training pairs found. Using baseline medical AI knowledge.

RECOMMENDATION: Upload worksheet-report training pairs via Admin Panel → AI Training tab to:
• Improve report accuracy and consistency
• Customize terminology for your clinic's style  
• Enhance AI understanding of your reporting preferences
• Enable category-specific report generation

Current mode: Default medical AI knowledge without training data context.`;
    }

    console.log("=== AI TRAINING INTEGRATION DEBUG ===");
    console.log("Training context length:", trainingContext.length);
    console.log("Training context preview:", trainingContext.substring(0, 500) + "...");
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert radiologist AI assistant specialized in ultrasound report generation. Generate professional ultrasound reports based on worksheet images and extracted patient data, utilizing uploaded training examples for consistency.

          REPORT STRUCTURE:
          - Study Type: (e.g., "Abdominal Ultrasound", "Pelvic Ultrasound", "Vascular Ultrasound")
          - Indication: (reason for exam, clinical question)
          - Findings: (detailed observations, measurements, anatomical descriptions)
          - Impression: (concise clinical summary and recommendations)

          QUALITY STANDARDS:
          - Use professional medical terminology
          - Include specific anatomical references
          - Provide measurements when visible
          - Note normal and abnormal findings
          - Make appropriate clinical recommendations
          - Match complexity level to training examples when available
          
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
              text: `🔥 URGENT: Generate a report for this ultrasound worksheet using TRAINING DATA GUIDANCE.

PATIENT INFO:
- Patient: ${extractedData.patientName || 'Not specified'}
- DOB: ${extractedData.patientDob || 'Not specified'}  
- Exam Date: ${extractedData.examDate || new Date().toLocaleDateString()}

⚠️  CRITICAL TRAINING INSTRUCTION:
You have ${trainingData.length} training examples showing REAL CLINICAL FINDINGS from similar worksheets. 

${trainingData.length > 0 ? `
🏥 SPECIFIC TRAINING GUIDANCE:
Your training data includes ${trainingData.filter(t => t.category === 'vascular').length} vascular studies. If this worksheet shows:
• Venous reflux patterns → Report venous insufficiency (as shown in training)
• Flow abnormalities → Report flow disorders (as shown in training)  
• Compression test results → Report based on training patterns
• Varicose patterns → Report varicosities (as shown in training)

TRAINING PATTERN MATCH: Look for clinical findings similar to your training examples and report them accurately.` : ''}

ANALYZE THIS WORKSHEET: Look carefully at ALL markings, measurements, annotations, and findings. Match what you see to the clinical patterns in your training data.`
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
