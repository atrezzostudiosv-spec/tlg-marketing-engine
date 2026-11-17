import type { Fact, Property, Post } from "./contracts.ts";

export function isFactCurrent(fact: Fact, now: number): boolean {
  const verified = Date.parse(fact.verifiedAt);
  const expiry = fact.expiresAt === null ? Infinity : Date.parse(fact.expiresAt);
  if (fact.status !== "CONFIRMED" || !fact.sourceId || !Number.isFinite(now) ||
    !Number.isFinite(verified) || verified > now || !(expiry > now)) return false;
  const highVolatility = ["status", "price", "availability"].includes(fact.key);
  return !highVolatility || now - verified < 24 * 60 * 60 * 1000;
}

// Necessary conditions only. Never marks content LISTO or asserts factual/legal quality.
export function basicEligibility(property: Property, post: Post, facts: Fact[], now: number): string[] {
  const issues: string[] = [];
  if (property.id !== post.propertyId) issues.push("PROPERTY_MISMATCH");
  if (property.status !== "ACTIVE") issues.push("PROPERTY_NOT_ACTIVE");
  if (property.revision !== post.propertyRevision) issues.push("REVISION_CHANGED");
  const statuses = facts.filter(f => f.propertyId === property.id && f.key === "status");
  if (statuses.length !== 1 || statuses[0].value !== property.status ||
    !isFactCurrent(statuses[0], now)) issues.push("STATUS_NOT_CURRENT");
  if (!Number.isFinite(Date.parse(post.plannedAt))) issues.push("INVALID_DATE");
  if (post.workflowState === "CANCELADO" || post.workflowState === "PUBLICADO")
    issues.push("WORKFLOW_CLOSED");
  return issues;
}
