import type { Asset, Fact, Post, Property } from "./contracts.ts";
import { basicEligibility, isFactCurrent } from "./eligibility.ts";

export type Source = { id: string; authorization: "APPROVED" | "UNKNOWN" | "DENIED" };

export function validateInputs(input: {
  property: Property; post: Post; facts: Fact[]; sources: Source[];
  requiredFactIds: string[]; assets: Asset[]; now: number;
}): string[] {
  const {property, post, facts, sources, requiredFactIds, assets, now} = input;
  const issues = basicEligibility(property, post, facts, now);
  const ownFacts = facts.filter(f => f.propertyId === property.id);
  const statusFacts = ownFacts.filter(f => f.key === "status");
  const ids = new Set([...requiredFactIds, ...statusFacts.map(f => f.id)]);
  for (const id of ids) {
    const matches = facts.filter(f => f.id === id);
    const f = matches[0];
    if (matches.length !== 1 || !f || f.propertyId !== property.id || !isFactCurrent(f, now)) {
      issues.push("FACT_UNAVAILABLE:" + id); continue;
    }
    const src = sources.filter(s => s.id === f.sourceId);
    if (src.length !== 1 || src[0].authorization !== "APPROVED") issues.push("SOURCE_NOT_APPROVED:" + id);
  }
  const seen = new Set<string>();
  for (const a of assets) {
    if (seen.has(a.id)) issues.push("DUPLICATE_ASSET:" + a.id);
    seen.add(a.id);
    if (a.propertyId !== property.id || a.rights !== "APPROVED" || a.staging === "UNKNOWN" || !a.storageKey.trim())
      issues.push("ASSET_NOT_APPROVED:" + a.id);
  }
  if (assets.length === 0) issues.push("ASSETS_MISSING");
  if (post.format === "carousel" && (assets.length < 2 || assets.some(a => a.mediaType !== "image")))
    issues.push("CAROUSEL_IMAGES_REQUIRED");
  if (post.format === "photo" && (assets.length !== 1 || assets[0].mediaType !== "image"))
    issues.push("PHOTO_REQUIRED");
  if (post.format === "reel" && (assets.length !== 1 || assets[0].mediaType !== "video"))
    issues.push("FINAL_VIDEO_REQUIRED");
  return [...new Set(issues)];
}

// Pure projection; persistence and external scheduling remain the responsibility of the backend/operator.
export function projectRevisionChange(property: Property, posts: readonly Post[]) {
  return posts.map(post => {
    if (post.propertyId !== property.id || post.workflowState === "PUBLICADO" || post.workflowState === "CANCELADO" ||
        (property.revision === post.propertyRevision && property.status === "ACTIVE"))
      return { post, externalActionRequired: false };
    const externalActionRequired = post.workflowState === "PROGRAMADO";
    const updated: Post = {...post, editorialState: "BLOQUEADO",
      workflowState: property.status !== "ACTIVE" && !externalActionRequired ? "CANCELADO" : post.workflowState};
    return { post: updated, externalActionRequired };
  });
}
