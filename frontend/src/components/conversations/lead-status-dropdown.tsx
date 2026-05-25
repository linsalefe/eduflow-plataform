'use client';

import { ChevronDown } from 'lucide-react';
import type { Contact, Pipeline } from '@/types/conversations';
import { getLeadColumns, hexToRgba } from '@/lib/inbox-constants';

interface LeadStatusDropdownProps {
  contact: Contact;
  pipelines: Pipeline[];
  showMenu: boolean;
  setShowMenu: (v: boolean) => void;
  onUpdate: (status: string) => void;
}

export function LeadStatusDropdown({
  contact,
  pipelines,
  showMenu,
  setShowMenu,
  onUpdate,
}: LeadStatusDropdownProps) {
  const columns = getLeadColumns(contact.pipeline_id, pipelines);
  const current =
    columns.find((c) => c.key === contact.lead_status) || columns[0];

  return (
    <div className="relative">
      {/* Botão fechado — mostra status atual */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all hover:shadow-sm"
        style={{
          borderColor: hexToRgba(current.color, 0.3),
          backgroundColor: hexToRgba(current.color, 0.12),
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: current.color }}
          />
          <span
            className="text-[13px] font-medium"
            style={{ color: current.color }}
          >
            {current.label}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#8696a0] transition-transform duration-200 ${
            showMenu ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown — colunas do funil do lead */}
      {showMenu && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#233138] rounded-xl border border-[#2a3942] shadow-lg z-10 overflow-hidden">
          {columns.map((col) => (
            <button
              key={col.key}
              onClick={() => {
                onUpdate(col.key);
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left"
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: col.color }}
              />
              <span className="text-[13px] text-[#e9edef]">{col.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
