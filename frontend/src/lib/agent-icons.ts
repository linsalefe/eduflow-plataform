import {
  Bot,
  Brain,
  MessageCircle,
  Sparkles,
  Zap,
  Headphones,
  Target,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

export const AGENT_ICONS: { name: string; icon: LucideIcon; label: string }[] = [
  { name: "Bot", icon: Bot, label: "Robo" },
  { name: "Brain", icon: Brain, label: "Cerebro" },
  { name: "MessageCircle", icon: MessageCircle, label: "Mensagem" },
  { name: "Sparkles", icon: Sparkles, label: "IA" },
  { name: "Zap", icon: Zap, label: "Rapido" },
  { name: "Headphones", icon: Headphones, label: "Atendimento" },
  { name: "Target", icon: Target, label: "Vendas" },
  { name: "Briefcase", icon: Briefcase, label: "Negocios" },
];

export function getAgentIcon(name: string): LucideIcon {
  return AGENT_ICONS.find((i) => i.name === name)?.icon || Bot;
}
