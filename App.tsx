import React, { useState } from 'react';
import JSZip from 'jszip';
import ImageUploader from './components/ImageUploader';
import BookForm from './components/BookForm';
import { identifyBookFromImage, findOrGenerateSynopsis } from './services/geminiService';
import { BookData, AppStatus, ProcessingError, HistoryItem, BulkImportItem, BOOK_CATEGORIES } from './types';
import { BookIcon, SpinnerIcon, CheckIcon, ArchiveIcon, PlusIcon, DownloadIcon, TrashIcon, PlayIcon, XMarkIcon, CopyIcon, ClockIcon, RefreshIcon } from './components/Icons';

/**
 * Crops an image based on normalized 0-1000 bounding box coordinates [ymin, xmin, ymax, xmax].
 */
const cropImage = (base64: string, box: number[]): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const [ymin, xmin, ymax, xmax] = box;
        const height = img.naturalHeight;
        const width = img.naturalWidth;
        
        // Convert 0-1000 scale to pixels
        let y = (ymin / 1000) * height;
        let x = (xmin / 1000) * width;
        let h = ((ymax - ymin) / 1000) * height;
        let w = ((xmax - xmin) / 1000) * width;
        
        // Ensure bounds are valid
        x = Math.max(0, x);
        y = Math.max(0, y);
        w = Math.min(width - x, w);
        h = Math.min(height - y, h);

        if (w <= 0 || h <= 0) {
          resolve(base64);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } else {
          resolve(base64);
        }
      } catch (e) {
        console.error("Error cropping image:", e);
        resolve(base64);
      }
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
};

/**
 * Helper to convert text to Title Case
 */
const toTitleCase = (str: string) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Extracts price from filename.
 * Logic: Take the number before the first dot.
 * Example: "380.1.jpg" -> "380"
 */
const extractPriceFromFilename = (filename: string): string => {
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : '';
};

/**
 * Encapsulated logic to process a single book image
 */
const processImagePipeline = async (
  base64Image: string, 
  autoCrop: boolean,
  onStep?: (step: 'analyzing' | 'synopsis') => void
): Promise<{ title: string; author: string; category: string; synopsis: string; processedImage: string }> => {
  
  if (onStep) onStep('analyzing');
  
  // Step 1: Vision Analysis & Cropping & Categorization
  const identity = await identifyBookFromImage(base64Image);
  
  // Apply Title Casing
  const title = toTitleCase(identity.title || "Unknown Title");
  const author = toTitleCase(identity.author || "Unknown Author");
  
  // Handle multiple categories or fallback to single
  let category = "";
  if (identity.categories && identity.categories.length > 0) {
    category = identity.categories.join(", ");
  } else if (identity.category) {
    category = identity.category;
  }
  
  let processedImage = base64Image;
  // Perform crop if requested AND bounding box exists
  if (autoCrop && identity.box_2d && identity.box_2d.length === 4) {
    processedImage = await cropImage(base64Image, identity.box_2d);
  }

  if (onStep) onStep('synopsis');

  // Step 2: Search/Generate Synopsis
  const synopsis = await findOrGenerateSynopsis(title, author);

  return { title, author, category, synopsis, processedImage };
};

// --- Components for Editable Table ---

const TableInput = ({ 
  value, 
  onChange, 
  placeholder,
  className = "",
  list,
  readOnly = false
}: { 
  value: string; 
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  list?: string;
  readOnly?: boolean;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative group flex items-center ${className}`}>
      <input 
        className={`w-full bg-transparent border-b border-transparent ${!readOnly ? 'hover:border-gray-300 focus:border-leather focus:ring-0' : ''} px-1 py-1 transition-all text-sm text-ink placeholder-gray-400`}
        value={value}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        placeholder={placeholder}
        list={list}
        readOnly={readOnly}
      />
      <button 
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 p-1 text-gray-400 hover:text-leather"
        title="Copy"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
};

const TableTextarea = ({ 
  value, 
  onChange, 
  readOnly = false
}: { 
  value: string; 
  onChange: (val: string) => void;
  readOnly?: boolean;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group flex items-start">
      <textarea 
        className={`w-full bg-transparent border border-transparent ${!readOnly ? 'hover:border-gray-300 focus:border-leather focus:ring-0 focus:bg-white' : ''} rounded px-2 py-1 transition-all text-xs text-gray-600 resize-none h-16 leading-tight`}
        value={value}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        readOnly={readOnly}
      />
      <button 
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-1 right-1 p-1 bg-white/80 rounded-full text-gray-400 hover:text-leather shadow-sm border border-gray-100"
        title="Copy"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
};


const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scanner' | 'bulk' | 'uploads' | 'archived'>('scanner');
  
  // --- SCANNER STATE ---
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  const [autoCrop, setAutoCrop] = useState(true);

  // --- HISTORY STATE ---
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [archived, setArchived] = useState<HistoryItem[]>([]);

  // --- BULK STATE ---
  const [bulkItems, setBulkItems] = useState<BulkImportItem[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // --- SCANNER HANDLERS ---

  const handleScannerFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    
    // Extract price from filename
    const extractedPrice = extractPriceFromFilename(file.name);
    
    setError(null);
    setBookData(null);
    setStatus(AppStatus.ANALYZING_IMAGE);

    // Read base64
    const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
    });

    setImage(base64);

    try {
      const result = await processImagePipeline(base64, autoCrop, (step) => {
        if (step === 'analyzing') setStatus(AppStatus.ANALYZING_IMAGE);
        if (step === 'synopsis') setStatus(AppStatus.SEARCHING_SYNOPSIS);
      });

      setBookData({
        title: result.title,
        author: result.author,
        synopsis: result.synopsis,
        category: result.category,
        price: extractedPrice, // Use extracted price
      });
      // Update the displayed image to the cropped version
      setImage(result.processedImage);
      setStatus(AppStatus.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setError({ message: err.message || "An unexpected error occurred." });
      setStatus(AppStatus.ERROR);
    }
  };

  const handleRegenerateSynopsis = async () => {
    if (!bookData) return;
    
    // Temporarily set status to show loading in the form button (handled by BookForm prop)
    // We can use a local loading state or hijack the main status, but main status hides the form.
    // Let's use the main status partially or add a specific prop to BookForm.
    // Simplest approach: Use a separate "searching" status that doesn't unmount the form.
    
    // Actually, BookForm is only visible when status === COMPLETED. 
    // If I change status to SEARCHING_SYNOPSIS, the form will disappear and the spinner will show.
    // That works fine and gives clear feedback.
    
    const currentTitle = bookData.title;
    const currentAuthor = bookData.author;
    
    setStatus(AppStatus.SEARCHING_SYNOPSIS);
    
    try {
      const newSynopsis = await findOrGenerateSynopsis(currentTitle, currentAuthor);
      setBookData(prev => prev ? { ...prev, synopsis: newSynopsis } : null);
      setStatus(AppStatus.COMPLETED);
    } catch (e) {
      console.error(e);
      // Just go back to completed, maybe keep old synopsis
      setStatus(AppStatus.COMPLETED);
    }
  };

  const saveBook = () => {
    if (bookData && image) {
      const newItem: HistoryItem = {
        ...bookData,
        id: crypto.randomUUID(),
        image: image,
        timestamp: Date.now(),
      };
      setHistory(prev => [newItem, ...prev]);
      
      // Reset Scanner
      setImage(null);
      setBookData(null);
      setStatus(AppStatus.IDLE);
    }
  };

  // --- BULK HANDLERS ---

  const handleBulkFilesSelected = (files: File[]) => {
    const newItems: BulkImportItem[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'idle',
      data: { 
        title: '', 
        author: '', 
        synopsis: '', 
        price: extractPriceFromFilename(file.name), // Extract price here
        category: '' 
      }
    }));
    setBulkItems(prev => [...prev, ...newItems]);
  };

  const startBulkProcessing = async () => {
    setIsBulkProcessing(true);
    const itemsToProcess = bulkItems.filter(item => item.status === 'idle');

    for (const item of itemsToProcess) {
      // Update status to processing
      setBulkItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'processing' } : i));

      try {
        // Read file to base64
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(item.file);
        });

        const result = await processImagePipeline(base64, autoCrop);

        setBulkItems(prev => prev.map(i => i.id === item.id ? { 
          ...i, 
          status: 'completed',
          data: { ...i.data, ...result, price: i.data.price }, // Keep existing price derived from filename
          processedImage: result.processedImage
        } : i));

      } catch (e) {
        setBulkItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: 'Failed' } : i));
      }
    }
    setIsBulkProcessing(false);
  };

  const saveBulkToHistory = () => {
    const completed = bulkItems.filter(i => i.status === 'completed');
    const newHistoryItems: HistoryItem[] = completed.map(i => ({
      ...i.data,
      id: i.id,
      image: i.processedImage!, // Should be present if completed
      timestamp: Date.now()
    }));

    setHistory(prev => [...newHistoryItems, ...prev]);
    setBulkItems(prev => prev.filter(i => i.status !== 'completed'));
    setActiveTab('uploads');
  };

  const removeBulkItem = (id: string) => {
    setBulkItems(prev => prev.filter(i => i.id !== id));
  };

  // Update image in bulk item
  const updateBulkItemImage = (id: string, base64: string) => {
    setBulkItems(prev => prev.map(item =>
        item.id === id ? { ...item, processedImage: base64, previewUrl: base64 } : item
    ));
  };

  // --- HISTORY & EDIT HANDLERS ---

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const restoreArchivedItem = (id: string) => {
    const itemToRestore = archived.find(item => item.id === id);
    if (itemToRestore) {
      setArchived(prev => prev.filter(item => item.id !== id));
      setHistory(prev => [itemToRestore, ...prev]);
    }
  };

  const deleteArchivedItem = (id: string) => {
    setArchived(prev => prev.filter(item => item.id !== id));
  };

  // Helper to update a single field in history directly
  const updateHistoryField = (id: string, field: keyof BookData, value: string) => {
    setHistory(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  // Helper to update image only
  const updateHistoryImage = (id: string, base64: string) => {
    setHistory(prev => prev.map(item => 
      item.id === id ? { ...item, image: base64 } : item
    ));
  };

  const exportToWooCommerce = async () => {
    if (history.length === 0) return;

    const zip = new JSZip();
    
    // Headers matched to the user's provided sample CSV
    const headers = [
      "parent_sku", "sku", "post_title", "post_excerpt", "post_content", 
      "post_status", "regular_price", "sale_price", "stock_status", "stock", 
      "manage_stock", "weight", "Images", "tax:product_type", 
      "tax:product_cat", "tax:product_tag"
    ];
    
    let csvContent = headers.join(",") + "\n";

    // Construct base URL for images based on current date (WordPress default upload structure)
    // Using hemingwaysbooks.co.za as per user request
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const baseUrl = `https://hemingwaysbooks.co.za/wp-content/uploads/${year}/${month}/`;

    history.forEach(item => {
      // 1. Add Image to ZIP
      let imageName = "";
      if (item.image && item.image.startsWith('data:image')) {
          const extension = item.image.substring(item.image.indexOf('/') + 1, item.image.indexOf(';'));
          
          // Match the requested format: snake_case_title_full-uuid.ext
          // Example: drake_and_saint_helena_d397e01b-0828-4277-aa1a-dd7247db2426.jpeg
          const safeTitle = item.title
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
            .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
            
          imageName = `${safeTitle}_${item.id}.${extension}`;
          
          const base64Data = item.image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
          zip.file(imageName, base64Data, { base64: true });
      }

      // 2. Add Row to CSV
      const escape = (text: string) => {
        if (!text) return "";
        // Escape quotes by doubling them
        return `"${text.replace(/"/g, '""')}"`;
      };

      const imageUrl = imageName ? `${baseUrl}${imageName}` : "";

      const row = [
        "", // parent_sku
        escape(item.id.substring(0, 8)), // sku
        escape(`${item.title} – ${item.author}`), // post_title (Title – Author)
        escape(item.synopsis), // post_excerpt (Short Description)
        escape(item.synopsis), // post_content (Description)
        "publish", // post_status
        item.price, // regular_price
        "", // sale_price
        "instock", // stock_status
        "1", // stock
        "yes", // manage_stock
        "", // weight
        imageUrl, // Images (Full URL)
        "simple", // tax:product_type
        escape(item.category.replace(/\//g, ',')), // tax:product_cat - Replace slash with comma
        escape(item.author) // tax:product_tag (Using Author as Tag)
      ];

      csvContent += row.join(",") + "\n";
    });

    zip.file("products.csv", csvContent);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bookscout_export_${new Date().toISOString().slice(0,10)}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // MOVE TO ARCHIVED
    const justProcessed = [...history];
    setArchived(prev => [...justProcessed, ...prev]);
    setHistory([]);
    setActiveTab('archived');
  };

  // --- RENDER HELPERS ---

  const renderStatus = () => {
    switch (status) {
      case AppStatus.ANALYZING_IMAGE:
        return (
          <div className="flex flex-col items-center justify-center p-12 text-center animate-pulse">
            <SpinnerIcon />
            <h3 className="text-xl font-serif font-bold text-leather mt-4">Analyzing Cover...</h3>
            <p className="text-gray-500 mt-2">Identifying title, author and category.</p>
          </div>
        );
      case AppStatus.SEARCHING_SYNOPSIS:
        return (
          <div className="flex flex-col items-center justify-center p-12 text-center animate-pulse">
            <SpinnerIcon />
            <h3 className="text-xl font-serif font-bold text-leather mt-4">Writing Synopsis...</h3>
            <p className="text-gray-500 mt-2">Searching the web for plot details.</p>
          </div>
        );
      case AppStatus.ERROR:
        return (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600 font-medium mb-4">{error?.message}</p>
            <button 
              onClick={() => setStatus(AppStatus.IDLE)}
              className="px-4 py-2 bg-white border border-red-300 rounded-lg text-red-600 font-medium hover:bg-red-50"
            >
              Try Again
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen font-sans text-ink">
      {/* Global Datalist for Categories */}
      <datalist id="category-options">
          {BOOK_CATEGORIES.map(c => <option key={c} value={c} />)}
      </datalist>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <BookIcon />
            <h1 className="text-2xl font-serif font-bold tracking-tight text-ink">BookScout</h1>
          </div>
          <nav className="flex space-x-1">
            <button 
              onClick={() => setActiveTab('scanner')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'scanner' ? 'bg-orange-50 text-leather' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Scanner
            </button>
            <button 
               onClick={() => setActiveTab('bulk')}
               className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'bulk' ? 'bg-orange-50 text-leather' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Bulk Import
            </button>
            <button 
              onClick={() => setActiveTab('uploads')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${activeTab === 'uploads' ? 'bg-orange-50 text-leather' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <span>Uploaded</span>
              {history.length > 0 && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">{history.length}</span>}
            </button>
            <button 
              onClick={() => setActiveTab('archived')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${activeTab === 'archived' ? 'bg-orange-50 text-leather' : 'text-gray-500 hover:text-gray-900'}`}
            >
               <ClockIcon />
              <span>Archived</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* SCANNER TAB */}
        {activeTab === 'scanner' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-700 uppercase tracking-wide">1. Upload Photo</h2>
                  <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer hover:text-leather">
                     <input 
                       type="checkbox" 
                       checked={autoCrop} 
                       onChange={(e) => setAutoCrop(e.target.checked)}
                       className="w-4 h-4 text-leather rounded border-gray-300 focus:ring-leather"
                     />
                     <span>Auto-crop detected book</span>
                  </label>
                </div>
                <ImageUploader 
                  onFilesSelected={handleScannerFileSelected} 
                  disabled={status === AppStatus.ANALYZING_IMAGE || status === AppStatus.SEARCHING_SYNOPSIS}
                />
              </div>

              {image && status === AppStatus.COMPLETED && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
                   <h2 className="text-lg font-bold text-gray-700 mb-4 uppercase tracking-wide">Captured Image</h2>
                   <div className="relative rounded-lg overflow-hidden border border-gray-100 shadow-inner bg-gray-50">
                     <img src={image} alt="Book cover" className="w-full h-auto object-contain max-h-96 mx-auto" />
                   </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {status === AppStatus.IDLE && !bookData && (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-400">
                  <BookIcon />
                  <p className="mt-4 font-medium">Upload a book cover to extract details</p>
                </div>
              )}

              {(status === AppStatus.ANALYZING_IMAGE || status === AppStatus.SEARCHING_SYNOPSIS || status === AppStatus.ERROR) && (
                 <div className="bg-white rounded-2xl shadow-xl border border-gray-100 h-full flex items-center justify-center">
                    {renderStatus()}
                 </div>
              )}

              {status === AppStatus.COMPLETED && bookData && (
                <div className="h-full flex flex-col animate-in slide-in-from-right-8 duration-500">
                  <BookForm 
                    data={bookData} 
                    onChange={setBookData}
                    onRegenerateSynopsis={handleRegenerateSynopsis}
                  />
                  <div className="mt-4 flex space-x-3">
                    <button 
                      onClick={saveBook}
                      className="flex-1 bg-leather hover:bg-yellow-900 text-white py-3 px-6 rounded-xl font-bold text-lg shadow-lg shadow-orange-100 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center space-x-2"
                    >
                      <PlusIcon />
                      <span>Add to Uploads</span>
                    </button>
                    <button
                      onClick={() => { setStatus(AppStatus.IDLE); setImage(null); setBookData(null); }}
                       className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* BULK IMPORT TAB */}
        {activeTab === 'bulk' && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                 <div>
                    <h2 className="text-2xl font-serif font-bold text-ink">Bulk Import</h2>
                    <p className="text-gray-500 mt-1">Upload multiple photos, process them in batch, and export.</p>
                 </div>
                 <div className="flex items-center space-x-6">
                   <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer hover:text-leather font-medium">
                     <input 
                       type="checkbox" 
                       checked={autoCrop} 
                       onChange={(e) => setAutoCrop(e.target.checked)}
                       className="w-4 h-4 text-leather rounded border-gray-300 focus:ring-leather"
                     />
                     <span>Auto-crop detected books</span>
                   </label>
                   <div className="flex space-x-3">
                     {bulkItems.some(i => i.status === 'idle') && (
                       <button 
                          onClick={startBulkProcessing}
                          disabled={isBulkProcessing}
                          className="bg-leather text-white px-4 py-2 rounded-lg font-bold flex items-center space-x-2 hover:bg-yellow-900 disabled:opacity-50"
                       >
                          {isBulkProcessing ? <SpinnerIcon /> : <PlayIcon />}
                          <span>Process Pending</span>
                       </button>
                     )}
                     {bulkItems.some(i => i.status === 'completed') && (
                       <button 
                          onClick={saveBulkToHistory}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold flex items-center space-x-2 hover:bg-green-700"
                       >
                          <ArchiveIcon />
                          <span>Save Completed ({bulkItems.filter(i => i.status === 'completed').length})</span>
                       </button>
                     )}
                   </div>
                 </div>
              </div>
              
              <ImageUploader 
                onFilesSelected={handleBulkFilesSelected} 
                disabled={isBulkProcessing}
                multiple={true}
              />
            </div>

            {bulkItems.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-bold">
                        <th className="p-4 w-20">Image</th>
                        <th className="p-4 w-24">Status</th>
                        <th className="p-4 w-48">Details</th>
                        <th className="p-4 w-28">Price (R)</th>
                        <th className="p-4 w-40">Category</th>
                        <th className="p-4">Synopsis</th>
                        <th className="p-4 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bulkItems.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-4">
                            <label className="cursor-pointer block relative group w-16 h-20">
                               <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                          const reader = new FileReader();
                                          reader.onload = (evt) => {
                                              if (evt.target?.result) {
                                                  updateBulkItemImage(item.id, evt.target.result as string);
                                              }
                                          };
                                          reader.readAsDataURL(file);
                                      }
                                  }}
                               />
                               <div className="w-full h-full bg-gray-100 rounded overflow-hidden relative border border-gray-200">
                                   <img src={item.processedImage || item.previewUrl} className="w-full h-full object-cover" alt="" />
                                   <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                       <div className="opacity-0 group-hover:opacity-100 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded">Change</div>
                                   </div>
                               </div>
                            </label>
                          </td>
                          <td className="p-4">
                            {item.status === 'idle' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Pending</span>}
                            {item.status === 'processing' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">Thinking...</span>}
                            {item.status === 'completed' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Done</span>}
                            {item.status === 'error' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Failed</span>}
                          </td>
                          <td className="p-4">
                             <div className="space-y-1">
                                <input 
                                  className="w-full font-serif font-bold text-gray-900 bg-transparent border-none p-0 focus:ring-0 placeholder-gray-400" 
                                  placeholder={item.status === 'processing' ? "Detecting..." : "Title"}
                                  value={item.data.title} 
                                  readOnly
                                />
                                <input 
                                  className="w-full text-sm text-gray-600 bg-transparent border-none p-0 focus:ring-0 placeholder-gray-300" 
                                  placeholder={item.status === 'processing' ? "Detecting..." : "Author"}
                                  value={item.data.author} 
                                  readOnly
                                />
                             </div>
                          </td>
                          <td className="p-4">
                             <div className="relative">
                               <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm font-bold">R</span>
                               <input 
                                  type="text"
                                  className="w-full pl-6 pr-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm text-black font-medium focus:ring-2 focus:ring-accent focus:bg-white transition-colors"
                                  value={item.data.price}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setBulkItems(prev => prev.map(i => i.id === item.id ? { ...i, data: { ...i.data, price: val } } : i));
                                  }}
                                  placeholder="0.00"
                               />
                             </div>
                          </td>
                          <td className="p-4">
                              <input 
                                value={item.data.category} 
                                list="category-options"
                                onChange={(e) => {
                                   const val = e.target.value;
                                   setBulkItems(prev => prev.map(i => i.id === item.id ? { ...i, data: { ...i.data, category: val } } : i));
                                }}
                                className="w-full text-sm bg-gray-50 border border-gray-300 rounded px-2 py-1 text-black focus:ring-2 focus:ring-accent"
                                placeholder="Select or type..."
                              />
                          </td>
                          <td className="p-4">
                            <TableTextarea 
                              value={item.data.synopsis} 
                              onChange={(val) => {
                                 setBulkItems(prev => prev.map(i => i.id === item.id ? { ...i, data: { ...i.data, synopsis: val } } : i));
                              }}
                            />
                          </td>
                          <td className="p-4 text-right">
                             <button onClick={() => removeBulkItem(item.id)} className="text-gray-400 hover:text-red-500">
                               <XMarkIcon />
                             </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* UPLOADED HISTORY TAB */}
        {activeTab === 'uploads' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
            <div className="p-6 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50">
               <div>
                  <h2 className="text-2xl font-serif font-bold text-ink">Uploaded Inventory</h2>
                  <p className="text-gray-500">Edit fields directly in the table. <br/>Items will be moved to Archive after download.</p>
               </div>
               <div className="flex space-x-3">
                 <button 
                   onClick={() => setHistory([])}
                   className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg font-bold hover:bg-gray-50 text-sm transition-colors"
                 >
                   Clear All
                 </button>
                 <button 
                   onClick={exportToWooCommerce}
                   className="bg-leather text-white px-4 py-2 rounded-lg font-bold flex items-center space-x-2 hover:bg-yellow-900 shadow-md transition-all active:scale-95"
                 >
                    <DownloadIcon />
                    <span>Download CSV + Images</span>
                 </button>
               </div>
            </div>

            {history.length === 0 ? (
               <div className="flex flex-col items-center justify-center p-20 text-gray-400">
                  <ArchiveIcon />
                  <p className="mt-4 text-lg">Your inventory is empty.</p>
                  <button onClick={() => setActiveTab('scanner')} className="mt-2 text-leather hover:underline">Start scanning books</button>
               </div>
            ) : (
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="bg-white border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-bold">
                       <th className="p-4 w-20">Cover</th>
                       <th className="p-4 w-64">Book Details</th>
                       <th className="p-4 w-48">Category</th>
                       <th className="p-4 w-32">Price (R)</th>
                       <th className="p-4">Synopsis</th>
                       <th className="p-4 w-16"></th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100">
                     {history.map(item => (
                       <tr key={item.id} className="hover:bg-gray-50 group transition-colors align-top">
                         <td className="p-4">
                           <label className="cursor-pointer block relative group w-16 h-24">
                               <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                          const reader = new FileReader();
                                          reader.onload = (evt) => {
                                              if (evt.target?.result) {
                                                  updateHistoryImage(item.id, evt.target.result as string);
                                              }
                                          };
                                          reader.readAsDataURL(file);
                                      }
                                  }}
                               />
                               {item.image ? (
                                   <div className="w-full h-full bg-gray-200 rounded overflow-hidden border border-gray-300 shadow-sm relative">
                                       <img src={item.image} className="w-full h-full object-cover" alt="" />
                                       <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                           <div className="opacity-0 group-hover:opacity-100 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded">Change</div>
                                       </div>
                                   </div>
                               ) : (
                                   <div className="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-400 group-hover:bg-gray-200">
                                       Add
                                   </div>
                               )}
                           </label>
                         </td>
                         <td className="p-4 space-y-2">
                           <TableInput 
                             value={item.title} 
                             onChange={(val) => updateHistoryField(item.id, 'title', val)}
                             className="font-serif font-bold text-ink text-base"
                             placeholder="Title"
                           />
                           <TableInput 
                             value={item.author} 
                             onChange={(val) => updateHistoryField(item.id, 'author', val)}
                             className="text-gray-600"
                             placeholder="Author"
                           />
                         </td>
                         <td className="p-4">
                           <TableInput 
                             value={item.category} 
                             onChange={(val) => updateHistoryField(item.id, 'category', val)}
                             className="text-gray-700"
                             placeholder="Category"
                             list="category-options"
                           />
                         </td>
                         <td className="p-4">
                            <TableInput 
                             value={item.price} 
                             onChange={(val) => updateHistoryField(item.id, 'price', val)}
                             className="font-medium text-green-700"
                             placeholder="0.00"
                           />
                         </td>
                         <td className="p-4">
                           <TableTextarea 
                             value={item.synopsis}
                             onChange={(val) => updateHistoryField(item.id, 'synopsis', val)}
                           />
                         </td>
                         <td className="p-4 text-right pt-6">
                             <button 
                                onClick={() => deleteHistoryItem(item.id)}
                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                             >
                                <TrashIcon />
                             </button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            )}
          </div>
        )}

        {/* ARCHIVED TAB */}
        {activeTab === 'archived' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between bg-gray-50">
               <div>
                  <h2 className="text-2xl font-serif font-bold text-ink">Archived Books</h2>
                  <p className="text-gray-500">History of downloaded and processed items (Read-only).</p>
               </div>
               <div className="flex space-x-3">
                 <button 
                   onClick={() => setArchived([])}
                   className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg font-bold hover:bg-gray-50 text-sm transition-colors"
                 >
                   Clear Archive
                 </button>
               </div>
            </div>

            {archived.length === 0 ? (
               <div className="flex flex-col items-center justify-center p-20 text-gray-400">
                  <ClockIcon />
                  <p className="mt-4 text-lg">No archived books yet.</p>
                  <p className="text-sm">Books are moved here after downloading CSV.</p>
               </div>
            ) : (
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse opacity-80">
                   <thead>
                     <tr className="bg-white border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-bold">
                       <th className="p-4 w-20">Cover</th>
                       <th className="p-4 w-64">Book Details</th>
                       <th className="p-4 w-48">Category</th>
                       <th className="p-4 w-32">Price (R)</th>
                       <th className="p-4">Synopsis</th>
                       <th className="p-4 w-24">Action</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100">
                     {archived.map(item => (
                       <tr key={item.id} className="hover:bg-gray-50 transition-colors align-top">
                         <td className="p-4">
                            {item.image ? (
                                <div className="w-16 h-24 bg-gray-200 rounded overflow-hidden border border-gray-300 shadow-sm">
                                    <img src={item.image} className="w-full h-full object-cover grayscale" alt="" />
                                </div>
                            ) : (
                                <div className="w-16 h-24 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-400">No Img</div>
                            )}
                         </td>
                         <td className="p-4 space-y-2">
                           <TableInput 
                             value={item.title} 
                             onChange={() => {}}
                             className="font-serif font-bold text-gray-700 text-base"
                             placeholder="Title"
                             readOnly
                           />
                           <TableInput 
                             value={item.author} 
                             onChange={() => {}}
                             className="text-gray-500"
                             placeholder="Author"
                             readOnly
                           />
                         </td>
                         <td className="p-4">
                           <TableInput 
                             value={item.category} 
                             onChange={() => {}}
                             className="text-gray-500"
                             placeholder="Category"
                             readOnly
                           />
                         </td>
                         <td className="p-4">
                            <TableInput 
                             value={item.price} 
                             onChange={() => {}}
                             className="font-medium text-gray-600"
                             placeholder="0.00"
                             readOnly
                           />
                         </td>
                         <td className="p-4">
                           <TableTextarea 
                             value={item.synopsis}
                             onChange={() => {}}
                             readOnly
                           />
                         </td>
                         <td className="p-4 text-right pt-6 space-y-2">
                             <button 
                                onClick={() => restoreArchivedItem(item.id)}
                                className="flex items-center text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                                title="Restore to Uploads"
                             >
                                <RefreshIcon />
                                <span className="ml-1">Restore</span>
                             </button>
                             <button 
                                onClick={() => deleteArchivedItem(item.id)}
                                className="flex items-center text-xs text-gray-400 hover:text-red-500 transition-colors"
                                title="Delete Permanently"
                             >
                                <TrashIcon />
                                <span className="ml-1">Delete</span>
                             </button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
};

export default App;