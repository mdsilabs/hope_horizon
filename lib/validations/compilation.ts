import { z } from "zod";
import { uuidString } from "@/lib/validations/common";

export const markbookSaveSchema=z.object({
  classId:uuidString,subjectId:uuidString,termId:uuidString,submit:z.boolean(),
  scores:z.array(z.object({
    studentId:uuidString,
    ca:z.number().min(0).max(100).finite(),
    exam:z.number().min(0).max(100).finite(),
  }).strict()).min(1).max(250)
    .refine(list=>new Set(list.map(s=>s.studentId)).size===list.length,
      "Each student may appear only once."),
}).strict();
export const classCompileSchema=z.object({
  classId:uuidString,termId:uuidString,
}).strict();
export const batchDecisionSchema=z.object({
  action:z.enum(["APPROVE","RETURN"]),
  remarks:z.string().trim().max(500).default(""),
}).strict().refine(x=>x.action!=="RETURN" || x.remarks.length>0,{
  path:["remarks"],message:"A reason is required when returning a class.",
});
