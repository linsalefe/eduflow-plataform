'use client';

import { Droppable, Draggable } from '@hello-pangea/dnd';
import { KanbanCard, Lead } from './kanban-card';
import { LucideIcon, Users } from 'lucide-react';
import { motion } from 'framer-motion';

interface KanbanColumnProps {
  columnKey: string;
  label: string;
  color: string;
  icon: LucideIcon;
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
  index?: number;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,100,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function KanbanColumn({
  columnKey,
  label,
  color,
  icon: Icon,
  leads,
  onCardClick,
  index = 0,
}: KanbanColumnProps) {
  return (
    <motion.div
      className="min-w-[260px] w-[260px] flex-shrink-0 flex flex-col h-full"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: index * 0.04,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {/* Column Header - glass */}
      <div
        className="px-3.5 py-2.5 rounded-xl mb-2"
        style={{
          background: `linear-gradient(135deg, ${hexToRgba(color, 0.1)}, ${hexToRgba(color, 0.04)})`,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: `1px solid ${hexToRgba(color, 0.15)}`,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-lg flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${hexToRgba(color, 0.25)}, ${hexToRgba(color, 0.1)})`,
              }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <span className="text-[13px] font-semibold text-foreground truncate">
              {label}
            </span>
          </div>
          <span
            className="text-[12px] font-bold px-2 py-0.5 rounded-lg tabular-nums min-w-[28px] text-center"
            style={{
              color,
              background: `linear-gradient(135deg, ${hexToRgba(color, 0.15)}, ${hexToRgba(color, 0.06)})`,
            }}
          >
            {leads.length}
          </span>
        </div>
      </div>

      {/* Drop Zone */}
      <Droppable droppableId={columnKey}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex-1 rounded-xl p-2 space-y-2 overflow-y-auto transition-all duration-200 min-h-[100px]"
            style={
              snapshot.isDraggingOver
                ? {
                    background: `linear-gradient(180deg, ${hexToRgba(color, 0.08)}, ${hexToRgba(color, 0.02)})`,
                    border: `2px dashed ${hexToRgba(color, 0.35)}`,
                  }
                : {
                    background: 'transparent',
                    border: '2px dashed transparent',
                  }
            }
          >
            {leads.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-center py-8">
                <div
                  className="w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center"
                  style={{ background: hexToRgba(color, 0.06) }}
                >
                  <Users className="w-4 h-4" style={{ color, opacity: 0.35 }} />
                </div>
                <p className="text-[11px] text-muted-foreground/40">Nenhum lead</p>
              </div>
            )}

            {leads.map((lead, idx) => (
              <Draggable key={lead.wa_id} draggableId={lead.wa_id} index={idx}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <KanbanCard
                      lead={lead}
                      color={color}
                      onClick={() => onCardClick(lead)}
                      isDragging={snapshot.isDragging}
                    />
                  </div>
                )}
              </Draggable>
            ))}

            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </motion.div>
  );
}