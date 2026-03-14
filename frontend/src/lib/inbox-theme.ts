/**
 * Inbox Dark Theme Tokens
 * Substitui as 101 cores hardcoded por constantes controladas.
 * Futuramente pode virar CSS variables para suportar tema light de inbox.
 */
export const inbox = {
  // Backgrounds
  bg: {
    sidebar: '#111b21',
    header: '#202c33',
    chat: '#0b141a',
    input: '#2a3942',
    hover: '#202c33',
    selected: '#2a3942',
    dropdown: '#233138',
    dateBadge: '#182229',
  },
  // Borders
  border: {
    default: '#2a3942',
    subtle: '#222d34',
  },
  // Text
  text: {
    primary: '#e9edef',
    secondary: '#8696a0',
    muted: '#3b4a54',
    link: '#53bdeb',
  },
  // Bubbles
  bubble: {
    outbound: '#005c4b',
    inbound: '#202c33',
  },
  // Status icons
  status: {
    check: '#b3d1cb',
    read: '#53bdeb',
  },
  // Accents
  accent: {
    green: '#00a884',
    greenHover: '#06cf9c',
    aiTag: '#ffffff99',
  },
} as const;
