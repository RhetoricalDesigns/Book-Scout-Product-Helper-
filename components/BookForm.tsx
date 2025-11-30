import React, { useState } from 'react';
import { BookData, BOOK_CATEGORIES } from '../types';
import { CopyIcon, CheckIcon, RefreshIcon } from './Icons';

interface BookFormProps {
  data: BookData;
  onChange: (data: BookData) => void;
  onRegenerateSynopsis?: () => void;
  isRegenerating?: boolean;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  multiline?: boolean;
  type?: string;
  prefix?: string;
  list?: string;
  action?: React.ReactNode;
}

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      type="button"
      className="text-gray-400 hover:text-leather transition-colors p-1 rounded-md hover:bg-gray-100"
      title="Copy to clipboard"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
};

const FormField: React.FC<FieldProps> = ({ label, value, onChange, multiline, type = "text", prefix, list, action }) => (
  <div className="mb-6 group">
    <div className="flex justify-between items-end mb-2">
        <label className="block text-sm font-bold text-gray-700 uppercase tracking-wider">{label}</label>
        <div className="flex items-center space-x-2">
            {action}
            <CopyButton text={value} />
        </div>
    </div>
    <div className="relative">
      {prefix && (
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span className="text-gray-500 font-serif font-bold">{prefix}</span>
        </div>
      )}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-leather focus:ring-2 focus:ring-orange-100 outline-none transition-shadow resize-none bg-paper text-ink font-serif leading-relaxed shadow-sm"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          list={list}
          className={`w-full ${prefix ? 'pl-8' : 'px-4'} py-3 rounded-lg border border-gray-300 focus:border-leather focus:ring-2 focus:ring-orange-100 outline-none transition-shadow bg-paper text-ink font-serif font-medium shadow-sm`}
        />
      )}
    </div>
  </div>
);

const BookForm: React.FC<BookFormProps> = ({ data, onChange, onRegenerateSynopsis, isRegenerating }) => {
  const updateField = (field: keyof BookData, value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 h-full flex flex-col">
      <h2 className="text-2xl font-serif font-bold text-ink mb-6 border-b pb-4 border-gray-100">
        Product Information
      </h2>
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <FormField
            label="Book Title"
            value={data.title}
            onChange={(val) => updateField('title', val)}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Author"
              value={data.author}
              onChange={(val) => updateField('author', val)}
            />
            <FormField
              label="Category"
              value={data.category}
              onChange={(val) => updateField('category', val)}
              list="category-options"
            />
          </div>
          <FormField
              label="Price (ZAR)"
              value={data.price}
              onChange={(val) => updateField('price', val)}
              prefix="R"
            />
          <FormField
            label="Synopsis"
            value={data.synopsis}
            onChange={(val) => updateField('synopsis', val)}
            multiline
            action={onRegenerateSynopsis && (
              <button 
                onClick={onRegenerateSynopsis}
                disabled={isRegenerating}
                className="text-xs flex items-center space-x-1 text-leather hover:text-orange-700 font-medium px-2 py-1 rounded bg-orange-50 hover:bg-orange-100 transition-colors border border-orange-200"
                title="Research synopsis based on current Title and Author"
              >
                <RefreshIcon />
                <span>{isRegenerating ? 'Searching...' : 'Research Again'}</span>
              </button>
            )}
          />
      </div>
    </div>
  );
};

export default BookForm;