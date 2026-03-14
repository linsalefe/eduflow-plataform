'use client';

import { Droppable, Draggable } from '@hello-pangea/dnd';
import { KanbanCard, Lead } from './kanban-card';
import { LucideIcon, Users } from 'lucide-react';

interface KanbanColumnProps {
  columnKey: string;
  label: string;
  color: string;
  icon: LucideIcon;
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
}

export function KanbanColumn({
  columnKey,
  label,
  color,
  icon: Icon,
  leads,
  onCardClick,
}: KanbanColumnProps) {
  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col">
      {/* Column Header */}
      <div
        className="px-4 py-3 rounded-t-xl border border-b-0"
        style={{ backgroundColor: `${color}18`, borderColor: `${color}40` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" style={{ color }} />
            <span className="text-[13px] font-semibold" style={{ color }}>
              {label}
            </span>
          </div>
          <span
            className="text-[12px] font-bold px-2 py-0.5 rounded-full"
            style={{ color, backgroundColor: `${color}25` }}
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
            className="flex-1 border border-t-0 rounded-b-xl p-2.5 space-y-2.5 overflow-y-auto transition-all duration-200 min-h-[120px]"
            style={
              snapshot.isDraggingOver
                ? {
                    boxShadow: `0 0 0 2px ${color}`,
                    backgroundColor: `${color}08`,
                    borderColor: `${color}40`,
                  }
                : {
                    backgroundColor: 'rgba(255,255,255,0.5)',
                    borderColor: `${color}40`,
                  }
            }
          >
            {leads.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-center py-10 text-muted-foreground/30">
                <Users className="w-8 h-8 mx-auto mb-2" />
                <p className="text-[12px]">Nenhum lead</p>
              </div>
            )}

            {snapshot.isDraggingOver && leads.length === 0 && (
              <div
                className="border-2 border-dashed rounded-xl p-4 text-center"
                style={{ borderColor: color }}
              >
                <p className="text-[12px] font-medium" style={{ color }}>
                  Soltar aqui
                </p>
              </div>
            )}

            {leads.map((lead, index) => (
              <Draggable key={lead.wa_id} draggableId={lead.wa_id} index={index}>
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
    </div>
  );
}