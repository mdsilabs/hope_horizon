/** Derive clear school onboarding steps from authenticated, school-scoped facts. */
export type SetupSignals = {
  hasContact: boolean;
  hasAcademicPeriod: boolean;
  classCount: number;
  assignedSubjectCount: number;
  assignedTeacherCount: number;
  studentCount: number;
};
export type SetupStep = {
  key: string; title: string; description: string; href: string; done: boolean;
};

export function buildSetupSteps(facts: SetupSignals): SetupStep[] {
  return [
    {
      key: "profile", title: "Complete school details",
      description: "Add a school phone number or email for families to contact you.",
      href: "/admin/settings", done: facts.hasContact,
    },
    {
      key: "academic", title: "Activate an academic term",
      description: "Create a school session and term, then set the term as current.",
      href: "/admin/academic", done: facts.hasAcademicPeriod,
    },
    {
      key: "classes", title: "Create classes",
      description: "Register at least one active class.",
      href: "/admin/classes", done: facts.classCount > 0,
    },
    {
      key: "subjects", title: "Assign a subject to a class",
      description: "Create subjects and attach at least one to a class.",
      href: "/admin/classes", done: facts.assignedSubjectCount > 0,
    },
    {
      key: "teachers", title: "Assign a teacher",
      description: "Create a teacher account and assign a subject and class.",
      href: "/admin/teachers", done: facts.assignedTeacherCount > 0,
    },
    {
      key: "students", title: "Enrol students",
      description: "Add at least one active student to a class.",
      href: "/admin/students", done: facts.studentCount > 0,
    },
  ];
}
