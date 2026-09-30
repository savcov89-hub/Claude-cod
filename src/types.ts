import type { ClientInsights } from './analytics';

export type Role = 'trainer' | 'client';

export interface Profile {
  role: Role;
  name: string;
  email: string;
}
export interface ClientNotes {
  goal?: string;
  limits?: string;
  notes?: string;
}
export interface ClientItem {
  clientId: string;
  clientName: string;
  clientEmail: string;
  userId?: string | null;
  connectedAt: string;
  createdAt?: string;
  checkedInAt?: string | null;
  visits?: string[];
  latestSessionId?: string;
  latestCompletedAt?: string;
  needsReview?: boolean;
  notes?: ClientNotes;
  insights?: ClientInsights;
  archived?: boolean;
}
export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  muscles?: string[];
  custom?: boolean;
}
export interface ProgramExercise {
  muscles?: string[];
  exerciseId: string;
  exerciseName: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
}
export interface ProgramDay {
  id: string;
  name: string;
  exercises: ProgramExercise[];
}
export interface Program {
  id: string;
  nextDayId?: string;
  lastCompletedAt?: string;
  lastRecordedByRole?: Role;
  trainerId: string;
  trainerName?: string;
  clientId: string;
  clientName: string;
  name: string;
  days: ProgramDay[];
  createdAt: string;
  updatedAt?: string;
  archived?: boolean;
}
export interface SetEntry {
  weight: number;
  reps: number;
  rir: number | null;
}
export interface SessionExercise {
  exerciseId: string;
  exerciseName: string;
  /** Planned exercise this one replaces for a single workout. */
  replaces?: string;
  /** Left out of this workout only; done sets still count. */
  skipped?: boolean;
  /** Added in the gym for this workout only, with its own targets (sets = sets.length). */
  extra?: { repMin: number; repMax: number; targetRir: number };
  sets: SetEntry[];
}
export interface Session {
  id: string;
  recordedByRole?: Role;
  recordedByName?: string;
  feedback?: string;
  programName: string;
  dayName: string;
  completedAt: string;
  exercises: SessionExercise[];
}
export interface WorkoutExercise extends ProgramExercise {
  /** Decides plates or kilograms; sent by the server for catalog and own exercises. */
  equipment?: string;
  previousSets: SetEntry[];
  previousAt?: string | null;
}
export interface WorkoutPayload {
  revision?: string | null;
  ownerName?: string;
  actorRole?: Role;
  ownerId: string;
  draft?: {
    exercises: SessionExercise[];
    updatedAt: string;
    feedback?: string;
    updatedByRole?: Role;
  } | null;
  programId: string;
  programName: string;
  trainerId: string;
  days?: Array<{ id: string; name: string }>;
  nextDayId?: string;
  day: { id: string; name: string; exercises: WorkoutExercise[] };
  /** Free workout only: what was done last time, to start "как в прошлый раз". */
  lastFree?: Array<{ exerciseId: string; exerciseName: string; sets: number; repMin: number; repMax: number; targetRir: number }>;
}
export interface Coach {
  trainerId: string;
  trainerName: string;
  checkedInAt?: string | null;
  visits?: string[];
}
