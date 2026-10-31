// Public website origin only; no credentials. Local previews should open the
// connected local website, while production defaults to the public MMG site.
export const websiteBaseUrl = (
  process.env.NEXT_PUBLIC_MMG_WEBSITE_URL || "https://mmgconcierge.com"
).replace(/\/$/, "");
