import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

export const fetchGitTuneAnalysis = async (commitPayload) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: JSON.stringify(commitPayload),
      config: {
        systemInstruction: `You are GitTune's analysis engine. Always output responses in valid JSON format only. Do not wrap it in markdown code blocks like \`\`\`json.`,
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("GitTune API Error:", error);
    throw error;
  }
};