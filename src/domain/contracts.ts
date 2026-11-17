export type EditorialState = "BORRADOR" | "VALIDANDO" | "LISTO" | "REQUIERE_ATENCION" | "BLOQUEADO";
export type WorkflowState = "PENDIENTE" | "PROGRAMADO" | "PUBLICADO" | "CANCELADO";
export type PropertyStatus = "ACTIVE" | "PENDING" | "SOLD" | "LEASED" | "WITHDRAWN" | "EXCLUDED";
export type Channel = "facebook" | "instagram";
export type Format = "carousel" | "photo" | "reel" | "story";
export interface Fact {
  id: string;
  propertyId: string;
  key: string;
  value: unknown;
  sourceId: string;
  verifiedAt: string;
  expiresAt: string | null;
  status: "CONFIRMED" | "UNCONFIRMED" | "CONFLICT";
}
export interface Property {
  id: string;
  status: PropertyStatus;
  revision: number;
  priority: number;
}
export interface Asset {
  id: string;
  propertyId: string;
  storageKey: string;
  mediaType: "image" | "video";
  rights: "APPROVED" | "UNKNOWN" | "DENIED";
  staging: "ORIGINAL" | "VIRTUAL" | "UNKNOWN";
}
export interface Post {
  id: string;
  propertyId: string;
  propertyRevision: number;
  plannedAt: string;
  format: Format;
  editorialState: EditorialState;
  workflowState: WorkflowState;
}
