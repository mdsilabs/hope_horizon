import {z} from "zod";
import {uuidString} from "@/lib/validations/common";

const base={
  classId:uuidString,
  termId:uuidString,
  reason:z.string().trim().min(10).max(1000),
};
export const submitIrregularitySchema=z.discriminatedUnion("kind",[
  z.object({
    ...base,kind:z.literal("ADD_STUDENT"),
    fullName:z.string().trim().min(2).max(120),
    admissionNumber:z.string().trim().min(2).max(50),
  }).strict(),
  z.object({
    ...base,kind:z.literal("EDIT_MARK"),
    studentId:uuidString,subjectId:uuidString,
    ca:z.number().finite().min(0).max(100),
    exam:z.number().finite().min(0).max(100),
  }).strict(),
]);
export const classIrregularityDecisionSchema=z.object({
  action:z.enum(["ENDORSE","REJECT"]),
  note:z.string().trim().max(1000).default(""),
}).strict().refine(v=>v.action!=="REJECT"||v.note.length>=10,{
  message:"Give at least 10 characters explaining a rejection",path:["note"],
});
export const adminIrregularityDecisionSchema=z.object({
  action:z.enum(["APPROVE","REJECT"]),
  note:z.string().trim().max(1000).default(""),
}).strict().refine(v=>v.action!=="REJECT"||v.note.length>=10,{
  message:"Give at least 10 characters explaining a rejection",path:["note"],
});
