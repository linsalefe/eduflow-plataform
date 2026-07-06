'use client';

import { Droppable, Draggable } from '@hello-pangea/dnd';
import { KanbanCard, Lead } from './kanban-card';
import { LucideIcon } from 'lucide-react';
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
      className="min-w-[272px] w-[272px] flex-shrink-0 flex flex-col h-full min-h-0 rounded-2xl bg-muted/60 border border-border"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: index * 0.04,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3.5 py-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-foreground/70 truncate">
            {label}
          </span>
        </div>
        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums bg-card text-foreground border border-border flex-shrink-0">
          {leads.length}
        </span>
      </div>

      {/* Drop Zone */}
      <Droppable droppableId={columnKey}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-2 rounded-b-2xl transition-colors duration-200"
            style={
              snapshot.isDraggingOver
                ? { background: hexToRgba(color, 0.07) }
                : undefined
            }
          >
            {leads.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-center py-8">
                <div
                  className="w-9 h-9 mx-auto mb-2 rounded-xl flex items-center justify-center"
                  style={{ background: hexToRgba(color, 0.08) }}
                >
                  <Icon className="w-4 h-4" style={{ color, opacity: 0.4 }} />
                </div>
                <p className="text-[11px] text-muted-foreground/50">
                  Arraste um lead para aqui
                </p>
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
