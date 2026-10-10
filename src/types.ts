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
  /** Ready-made picture (src/ui/avatars.tsx). */
  avatar?: string;
  /** In the gym: the workout under way (sets done, not finished). */
  live?: OpenWorkout;
  /** Workouts left open long ago that the server has just recorded by itself. */
  autoFinished?: AutoFinished[];
}
/** A workout left open (sets done, nothing saved for 3 hours) that the server recorded by itself. */
export interface AutoFinished {
  programId: string;
  dayId: string;
  dayName: string;
  /** Its date: the time of its last save. */
  completedAt: string;
  done: number;
}
/** A workout started and not finished: sets done, still open. */
export interface OpenWorkout {
  trainerId: string;
  programId: string;
  programName: string;
  dayId: string;
  dayName: string;
  updatedAt: string;
  done: number;
  /** A free workout (no program). */
  free?: boolean;
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
  extra?: { repMin: number; repMax: number; targetRir: number; once?: boolean };
  /** Short comment on this exercise in this workout. */
  note?: string;
  /** Own exercise: its muscles at the time (built-in ones are known by id). */
  muscles?: string[];
  sets: SetEntry[];
}
export interface Session {
  id: string;
  recordedByRole?: Role;
  recordedByName?: string;
  /** Recorded by the server: left open, nothing saved for 3 hours. */
  autoFinished?: boolean;
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
  /** Comment left on this exercise last time. */
  previousNote?: string;
}
export interface WorkoutPayload {
  revision?: string | null;
  /** When the client was marked «Пришёл». */
  checkedInAt?: string | null;
  /** Last change of the program: set counts changed after the workout was started apply to it. */
  programUpdatedAt?: string;
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
  /** Workouts of this program left open long ago, recorded by the server as this one was opened. */
  autoFinished?: AutoFinished[];
  /** Free workout only: what was done last time, to start "как в прошлый раз". */
  lastFree?: Array<{ exerciseId: string; exerciseName: string; sets: number; repMin: number; repMax: number; targetRir: number }>;
}
export interface Coach {
  trainerId: string;
  trainerName: string;
  checkedInAt?: string | null;
  visits?: string[];
  /** The picture the trainer chose for this client. */
  avatar?: string;
}
