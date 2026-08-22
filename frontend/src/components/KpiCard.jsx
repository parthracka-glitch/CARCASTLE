import React from "react";

export function KpiCard({
  icon: Icon,
  badge,
  label,
  value,
  sub,
  tone = "default",
  testid,
}) {
  const toneMap = {
    default: "text-[#20373B]",
    positive: "text-emerald-700",
    negative: "text-red-700",
    warn: "text-[#B8860B]",
  };

  const bgMap = {
    default: "bg-[#F4FAFC] text-[#20373B] border-[#C3E7F1]",
    positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
    negative: "bg-red-50 text-red-700 border-red-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
  };

  return (
    <div
      className="bg-white border border-[#C3E7F1] hover:border-[#519CAB] rounded-xl p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between"
      data-testid={testid}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            {Icon && (
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold border ${bgMap[tone]}`}>
                <Icon className="w-4 h-4" />
              </div>
            )}
            <span className="text-[11px] uppercase tracking-wider text-[#20373B]/80 font-bold">
              {label}
            </span>
          </div>
          {badge && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F4FAFC] text-[#519CAB] border border-[#C3E7F1]">
              {badge}
            </span>
          )}
        </div>
        <div
          className={`font-display text-2xl font-extrabold tracking-tight font-tabular ${toneMap[tone]}`}
        >
          {value}
        </div>
      </div>
      {sub && (
        <div className="text-xs text-slate-500 font-medium mt-3 pt-2.5 border-t border-[#C3E7F1]/50 leading-relaxed">
          {sub}
        </div>
      )}
    </div>
  );
}
