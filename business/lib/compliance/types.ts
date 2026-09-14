export type VerificationProvider = "grid" | "noah" | "bridge"

export type VerificationStatus =
  | "not_started"
  | "in_progress"
  | "pending"
  | "approved"
  | "rejected"
  | "hold"

export type VerificationSubjectKind = "business" | "individual"

export type VerificationSubjectRef =
  | { kind: "business"; businessId: string; subjectUserId: string }
  | { kind: "individual"; userId: string }

export type VirtualAccountProvider = "grid" | "noah" | "bridge"
export type VirtualAccountStatus = "active" | "pending" | "retired" | "failed"
