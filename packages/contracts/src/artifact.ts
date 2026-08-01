import { z } from "zod";

export const ArtifactTypeSchema = z.enum(["TEXT", "TODO", "MESSAGE", "REFERENCES"]);
export const ArtifactStatusSchema = z.enum(["ACTIVE", "DISCARDED"]);

export const ArtifactSchema = z.object({
  artifactId: z.string().min(1),
  gapId: z.string().min(1),
  actionId: z.string().min(1),
  type: ArtifactTypeSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  status: ArtifactStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Artifact = z.infer<typeof ArtifactSchema>;
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;
export type ArtifactStatus = z.infer<typeof ArtifactStatusSchema>;
