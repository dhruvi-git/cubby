import { CreditCard, FileText, Fingerprint, IdCard, Plane, Vote, type LucideIcon } from "lucide-react";

/** Colour and icon for each kind of ID card (matches the "Your IDs" cards). */
const LOOK: Record<string, { bg: string; icon: LucideIcon }> = {
  passport: { bg: "bg-lav", icon: Plane },
  aadhaar: { bg: "bg-cream", icon: Fingerprint },
  pan: { bg: "bg-blue", icon: CreditCard },
  driving_licence: { bg: "bg-mint", icon: IdCard },
  voter_id: { bg: "bg-peach", icon: Vote },
  other_id: { bg: "bg-mist", icon: IdCard },
};

export const lookFor = (idType: string | null | undefined) =>
  (idType && LOOK[idType]) || { bg: "bg-mist", icon: FileText };
