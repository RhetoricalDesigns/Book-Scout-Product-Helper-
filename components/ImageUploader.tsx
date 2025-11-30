import React, { useRef, useState, useEffect } from 'react';
import { UploadIcon } from './Icons';

interface ImageUploaderProps {
  onImageSelected?: (base64: string) => void;
  onFilesSelected?: (files: File[]) => void;
  disabled: boolean;
  multiple?: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  onImageSelected, 
  onFilesSelected,
  disabled, 
  multiple = false 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    
    // If onFilesSelected is present, we prefer passing the File object(s)
    if (onFilesSelected) {
      onFilesSelected([file]);
      return;
    }

    // Legacy/Fallback: Read as Data URL if only onImageSelected is provided
    if (onImageSelected) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          onImageSelected(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const processFiles = (files: FileList) => {
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
       if (files[i].type.startsWith('image/')) {
         validFiles.push(files[i]);
       }
    }

    if (validFiles.length === 0) return;

    if (onFilesSelected) {
      // Respect multiple flag: if false, only take the first one
      if (multiple) {
        onFilesSelected(validFiles);
      } else {
        onFilesSelected([validFiles[0]]);
      }
    } else if (validFiles.length > 0 && onImageSelected) {
      // Fallback to legacy single file processing
      processFile(validFiles[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || !e.dataTransfer.files.length) return;
    processFiles(e.dataTransfer.files);
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (disabled || !e.clipboardData) return;
    const items = e.clipboardData.items;
    const files: File[] = [];
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
       if (onFilesSelected) {
           if (multiple) {
             onFilesSelected(files);
           } else {
             onFilesSelected([files[0]]);
           }
       } else {
           processFile(files[0]);
       }
    }
  };

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, multiple]);

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative w-full h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors duration-200
        ${isDragging ? 'border-accent bg-orange-50' : 'border-gray-300 hover:border-leather bg-white'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*"
        multiple={multiple}
        onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
                processFiles(e.target.files);
            }
        }}
        disabled={disabled}
      />
      <UploadIcon />
      <p className="mt-4 text-sm font-medium text-gray-600">
        <span className="text-leather font-bold">Upload {multiple ? 'files' : 'a file'}</span> or drag and drop
      </p>
      <p className="mt-1 text-xs text-gray-400">
        PNG, JPG, WEBP up to 5MB
      </p>
      <div className="absolute top-2 right-2">
         <kbd className="inline-flex items-center border border-gray-200 rounded px-2 text-sm font-sans font-medium text-gray-400">
            ⌘ V
          </kbd>
          <span className="text-xs text-gray-400 ml-1">to paste</span>
      </div>
    </div>
  );
};

export default ImageUploader;