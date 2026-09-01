import React, { useState, useRef, useEffect } from "react";
import INDIA_CITIES from "@/data/indiaCities";
import { MapPin, Search } from "lucide-react";

export default function CityDropdown({ value, onChange, onStateChange, placeholder = "Search city / town...", required = false }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const wrapRef = useRef(null);

  // Sync internal query with value prop
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  const filtered = query
    ? INDIA_CITIES.filter((c) =>
        c.city.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 15)
    : INDIA_CITIES.slice(0, 15);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (item) => {
    setQuery(item.city);
    onChange(item.city);
    if (onStateChange) onStateChange(item.state);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && filtered[highlighted]) {
      e.preventDefault();
      select(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={wrapRef}>
      <div className="relative">
        <input
          type="text"
          className="w-full px-3.5 py-2.5 bg-white border border-[#C3E7F1] focus:border-[#519CAB] focus:ring-2 focus:ring-[#519CAB]/20 rounded-xl text-sm text-[#20373B] font-medium outline-none transition-all placeholder:text-slate-400 pl-9"
          placeholder={placeholder}
          value={query}
          required={required}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            setOpen(true);
            setHighlighted(0);
            onChange(val);

            if (val.trim() === "") {
              if (onStateChange) onStateChange("");
              return;
            }

            // Auto-fill state if there is an exact case-insensitive match
            const match = INDIA_CITIES.find(
              (c) => c.city.toLowerCase() === val.trim().toLowerCase()
            );
            if (match && onStateChange) {
              onStateChange(match.state);
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <MapPin className="w-4 h-4 text-[#519CAB] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {open && filtered.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#C3E7F1] rounded-xl shadow-xl max-h-56 overflow-y-auto z-50 divide-y divide-slate-100 list-none p-1.5 animate-in fade-in zoom-in-95 duration-100">
          {filtered.map((item, idx) => (
            <li
              key={`${item.city}-${item.state}-${idx}`}
              onClick={() => select(item)}
              className={`px-3 py-2 rounded-lg cursor-pointer text-xs sm:text-sm flex items-center justify-between transition-colors ${
                idx === highlighted
                  ? "bg-[#F4FAFC] text-[#20373B] font-semibold border-l-2 border-[#519CAB]"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
              onMouseEnter={() => setHighlighted(idx)}
            >
              <span className="font-semibold text-[#20373B]">{item.city}</span>
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                {item.state}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
