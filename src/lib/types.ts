export type Swatch = { hex: string; name: string; share: number; locked?: boolean };
export type Source = { label: string; url?: string };

export type Reference = {
  id: string;
  filename: string;
  mediaKey: string | null;
  width: number | null;
  height: number | null;
  source: "upload" | "instagram" | "link";
  sourceUrl: string | null;
  author: string | null;
  caption: string | null;
  status: "queued" | "enriching" | "ready" | "failed";
  tags: string[];
  style: string[];
  mood: string[];
  format: string | null;
  palette: Swatch[];
  ocr: string | null;
  ident: {
    title: string | null;
    maker: string | null;
    place: string | null;
    year: string | null;
    confidence: "high" | "medium" | "low" | "unidentified" | null;
    sources: Source[];
  };
  clusterId: string | null;
  savedAt: number | null;
  createdAt: number;
};

export type Board = {
  id: string;
  name: string;
  client: string | null;
  eventDate: string | null;
  style: "editorial" | "grid" | "collage";
  narrative: string | null;
  materials: string[];
  createdAt: number;
};

export type Cluster = { id: string; name: string; summary: string | null; size: number };
