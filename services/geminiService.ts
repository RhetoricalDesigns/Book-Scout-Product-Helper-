import { GoogleGenAI, Type } from "@google/genai";
import { BookAnalysisResult, BOOK_CATEGORIES } from "../types";

// Initialize the client with the API key from environment variables
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Step 1: Identify the book's title and author from the image.
 * Uses a JSON schema to ensure structured output.
 */
export const identifyBookFromImage = async (base64Image: string): Promise<BookAnalysisResult> => {
  try {
    const model = 'gemini-2.5-flash';
    
    // Clean base64 string if it contains data URI prefix
    const data = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
    
    // Create a string representation of the categories for the prompt
    const categoriesList = BOOK_CATEGORIES.join(", ");

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg', // Assuming jpeg for simplicity, or detect from input
              data: data,
            },
          },
          {
            text: `Identify the book in this image. Extract the exact Title and Author name. 
            Also detect the bounding box of the book itself in the image (ymin, xmin, ymax, xmax) on a scale of 0 to 1000. 
            Finally, categorize this book into ONE OR MORE of the following categories: ${categoriesList}.
            Select all that apply. If unsure, choose the most relevant ones.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            author: { type: Type.STRING },
            categories: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: BOOK_CATEGORIES },
              description: "List of fitting categories from the provided list" 
            },
            box_2d: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
              description: "Bounding box of the book [ymin, xmin, ymax, xmax] on a scale of 0 to 1000",
            },
          },
          required: ["title", "author", "box_2d", "categories"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No data returned from Gemini Vision.");
    
    return JSON.parse(text) as BookAnalysisResult;
  } catch (error) {
    console.error("Error identifying book:", error);
    throw new Error("Failed to identify book from image.");
  }
};

/**
 * Step 2: Search for the synopsis using the extracted title and author.
 * Uses the Google Search tool to ensure accuracy, but generates one if not found.
 */
export const findOrGenerateSynopsis = async (title: string, author: string): Promise<string> => {
  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      Provide a synopsis for the book "${title}" by "${author}".
      
      Instructions:
      1. First, USE GOOGLE SEARCH to find the official publisher's blurb, back cover text, or a reputable review.
      2. If found, synthesize this information into a single, engaging paragraph.
      3. IF NO INFORMATION IS FOUND ONLINE: You MUST GENERATE a compelling synopsis yourself based on the title, author, and likely genre. Do not say "I couldn't find it". Write a synopsis that would help sell the book in a second-hand bookstore.
      4. STRICT CONSTRAINT: The synopsis MUST be less than 100 words.
      5. Return ONLY the synopsis text. Do not include introductory phrases.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    if (!text) return "Synopsis could not be generated.";
    
    return text.trim();
  } catch (error) {
    console.error("Error fetching synopsis:", error);
    return "Could not retrieve synopsis due to an error.";
  }
};