import { z } from "zod";

/// Email simple — pas de check DNS, juste structure.
const emailSchema = z
  .email("Email invalide")
  .min(3)
  .max(255)
  .transform((v) => v.trim().toLowerCase());
const passwordSchema = z.string().min(8, "Mot de passe trop court (min 8)").max(200);
const identifierSchema = z.string().trim().min(1, "Identifiant requis").max(255);

export const loginSchema = z.object({
  identifier: identifierSchema, // email OU matricule
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(100),
  lastName: z.string().trim().min(1, "Nom requis").max(100),
  email: emailSchema,
  matricule: z.string().trim().min(1, "Matricule requis").max(50),
  password: passwordSchema,
  acceptedTerms: z.literal(true, {
    message: "Vous devez accepter les conditions d'utilisation",
  }),
  jobTitle: z.string().trim().max(150).optional().nullable(),
  departmentId: z.string().trim().optional().nullable(),
  serviceId: z.string().trim().optional().nullable(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  identifier: identifierSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  employeeId: z.string().trim().min(1, "employeeId requis").max(50),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  password: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
