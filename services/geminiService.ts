
import { GoogleGenAI } from "@google/genai";

if (!process.env.API_KEY) {
  console.warn(
    "API_KEY environment variable not set. AI features will be disabled."
  );
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const model = "gemini-2.5-flash";

export const generateTagsForImage = async (base64Image: string, mimeType: string): Promise<string[]> => {
  if (!process.env.API_KEY) {
    return ["IA Desativada"];
  }

  try {
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType,
      },
    };

    const textPart = {
      text: "Descreva esta imagem com 5 a 7 palavras-chave relevantes para marcação em uma galeria de imagens. Use palavras únicas ou frases curtas de duas palavras. Separe-as com vírgulas. Exemplo: 'pôr do sol, praia, oceano, ondas, sereno'.",
    };

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [imagePart, textPart] },
      config: {
        thinkingConfig: { thinkingBudget: 0 } // faster response for tagging
      }
    });
    
    const text = response.text;
    if (text) {
      return text.split(',').map(tag => tag.trim()).filter(Boolean);
    }
    return ["falha na marcação"];
  } catch (error) {
    console.error("Error generating tags with Gemini API:", error);
    return ["erro de IA"];
  }
};
