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
      className="flex-1 min-w-0 flex flex-col"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: index * 0.06,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {/* Column Header */}
      <div
        className="px-4 py-3 rounded-t-xl border border-b-0"
        style={{
          background: `linear-gradient(135deg, ${color}14 0%, ${color}08 100%)`,
          borderColor: `${color}30`,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-md flex items-center justify-center"
              style={{ backgroundColor: `${color}20` }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <span className="text-[13px] font-semibold text-foreground">
              {label}
            </span>
          </div>
          <span
            className="text-[12px] font-bold px-2 py-0.5 rounded-full tabular-nums"
            style={{ color, backgroundColor: `${color}18` }}
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
            className="flex-1 border border-t-0 rounded-b-xl p-2.5 space-y-2 overflow-y-auto transition-all duration-200 min-h-[120px]"
            style={
              snapshot.isDraggingOver
                ? {
                    boxShadow: `inset 0 0 0 2px ${color}40`,
                    backgroundColor: `${color}06`,
                    borderColor: `${color}30`,
                  }
                : {
                    backgroundColor: 'var(--card)',
                    borderColor: `${color}30`,
                  }
            }
          >
            {leads.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-center py-10">
                <div className="relative w-12 h-12 mx-auto mb-2">
                  <div
                    className="absolute inset-0 rounded-full opacity-10"
                    style={{ backgroundColor: color }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Users className="w-5 h-5" style={{ color, opacity: 0.4 }} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/50">Nenhum lead</p>
              </div>
            )}

            {snapshot.isDraggingOver && leads.length === 0 && (
              <div
                className="border-2 border-dashed rounded-xl p-4 text-center transition-colors"
                style={{ borderColor: `${color}60` }}
              >
                <p className="text-[12px] font-medium" style={{ color }}>
                  Soltar aqui
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