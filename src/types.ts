export interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  systemInstruction: string;
  activeLanguage: string;
  createdAt: string;
}

export interface ActionTemplate {
  id: string;
  label: string;
  icon: string;
  description: string;
  templateText: string;
}

export interface FaqItem {
  question: string;
  answer: string;
  category: string;
}
