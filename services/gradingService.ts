import type { GradeBand } from "@/types/database";

/**
 * Resolves a numeric score to a grade using the school's configured
 * grading scale. Returns undefined if no band matches (e.g. scale not
 * configured yet) rather than guessing — the caller/UI should surface
 * that the school has not set up grading.
 */
export function resolveGrade(score: number, gradingScale: GradeBand[]): string | undefined {
  const band = gradingScale.find((b) => score >= b.minScore && score <= b.maxScore);
  return band?.grade;
}

export interface ComputedSubjectScore {
  ca: number;
  exam: number;
  total: number;
  grade?: string;
}

export function computeSubjectScore(
  ca: number,
  exam: number,
  gradingScale: GradeBand[]
): ComputedSubjectScore {
  const total = ca + exam;
  return { ca, exam, total, grade: resolveGrade(total, gradingScale) };
}

/** Computes overall total/average across all of a student's subject scores. */
export function computeOverall(scores: { total: number }[]): {
  overallTotal: number;
  overallAverage: number;
} {
  const overallTotal = scores.reduce((sum, s) => sum + s.total, 0);
  const overallAverage = scores.length > 0 ? overallTotal / scores.length : 0;
  return { overallTotal, overallAverage: Math.round(overallAverage * 100) / 100 };
}

/**
 * Assigns class positions (1st, 2nd, ...) based on descending overall total.
 * Ties share the same position (standard competition ranking).
 */
export function computeClassPositions(
  results: { resultId: string; overallTotal: number }[]
): Record<string, number> {
  const sorted = [...results].sort((a, b) => b.overallTotal - a.overallTotal);
  const positions: Record<string, number> = {};
  let lastTotal: number | null = null;
  let lastPosition = 0;
  sorted.forEach((r, index) => {
    if (r.overallTotal !== lastTotal) {
      lastPosition = index + 1;
      lastTotal = r.overallTotal;
    }
    positions[r.resultId] = lastPosition;
  });
  return positions;
}
