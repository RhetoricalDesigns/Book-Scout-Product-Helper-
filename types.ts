export interface BookData {
  title: string;
  author: string;
  synopsis: string;
  price: string;
  category: string;
}

export interface BookAnalysisResult {
  title?: string;
  author?: string;
  box_2d?: number[];
  categories?: string[];
  category?: string;
  price?: string;
  synopsis?: string;
}

export interface HistoryItem extends BookData {
  id: string;
  image: string; // Base64 image
  timestamp: number;
}

export interface BulkImportItem {
  id: string;
  file: File;
  previewUrl: string; // Object URL for display
  status: 'idle' | 'processing' | 'completed' | 'error';
  data: BookData; // Stores the AI results + User price
  processedImage?: string; // Stores the cropped image base64
  error?: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  ANALYZING_IMAGE = 'ANALYZING_IMAGE',
  SEARCHING_SYNOPSIS = 'SEARCHING_SYNOPSIS',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface ProcessingError {
  message: string;
}

export const BOOK_CATEGORIES = [
  // Africana & SA
  "Africana", "Afrikaans", "Apartheid", "Border Wars / War Stories", "Bushmen & Rock Art", 
  "Hermanus – Overberg", "Rhodesiana", "SA Authors", "South African Military", 
  "South West Africa & Namibia", "Zulu Wars",
  
  // Arts & Culture
  "Architecture", "Art & Art Reference", "Coffee Table Books", "Film, Dance & Music", 
  "Interior Design", "Photography (19th century)", "Photography (20th Century)", "Tribal History",
  
  // History & Social
  "Archaeology", "Early Man / Prehistory", "Folklore", "History", "Military & Naval", "Mining", 
  "Natural History", "Political", "World History", "World Wars",
  
  // Hobbies & Lifestyle
  "Automotive", "Aviation", "Cars and Railways", "Cookery & Wine", "Fishing", "Gardening", 
  "Hunting", "Sailing / Naval", "Sport", "Transport", "Travel",
  
  // Literature & Beliefs
  "Americana", "Children’s Classics", "Children’s Literature", "Classics and Poetry", 
  "Fiction", "Literature & Poetry", "Biography", "Biography, Letters & Diaries", 
  "Esoteric and Spiritual", "Missionary Endeavour", "Non-Fiction / Memoirs / Biographies", 
  "Philosophy", "Religion",
  
  // Science & Nature
  "Anthropology", "Botanical", "Ethnography", "Flora and Fauna", "Geography", "Mammals", 
  "Marine Life", "Ornithology", "Science & Biology",
  
  // Collections
  "Collections", "Collectables", "First Editions", "Maps", "Modern First Editions", 
  "Printing: Private Press Books"
];