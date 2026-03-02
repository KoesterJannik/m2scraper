import { useState, useRef, useEffect, useCallback } from "react";

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  label: string;
  type?: "text" | "number";
  step?: string;
  className?: string;
}

export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  label,
  type = "text",
  className = "",
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Filter suggestions based on current input
  const filtered = value.length >= 1
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0, 15)
    : [];

  const showDropdown = isOpen && filtered.length > 0;

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex(prev => Math.min(prev + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex(prev => Math.max(prev - 1, 0));
        break;
      case "Enter":
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          e.preventDefault();
          onChange(filtered[highlightIndex]);
          setIsOpen(false);
          setHighlightIndex(-1);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightIndex(-1);
        break;
    }
  }, [showDropdown, highlightIndex, filtered, onChange]);

  const handleSelect = (suggestion: string) => {
    onChange(suggestion);
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  // Highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="font-semibold text-blue-600">{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    );
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setHighlightIndex(-1);
        }}
        onFocus={() => value.length >= 1 && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        autoComplete="off"
      />
      {showDropdown && (
        <ul
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          {filtered.map((suggestion, i) => (
            <li
              key={i}
              className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                i === highlightIndex
                  ? "bg-blue-50 text-blue-800"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur before click fires
                handleSelect(suggestion);
              }}
              onMouseEnter={() => setHighlightIndex(i)}
            >
              {highlightMatch(suggestion, value)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
