import {z} from "zod";
import {uuidString} from "@/lib/validations/common";

// Used by the browser and API; the database separately enforces school,
// assignment and configured subject score limits.
const personName=z.string().trim().min(2,"Enter at least two characters.")
  .max(120,"Name must be 120 characters or fewer.")
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u,
    "Use letters, spaces, apostrophes, hyphens or periods only.");
const admissionNumber=z.string().trim()
  .min(2,"Enter a valid admission number.")
  .max(50,"Admission number must be 50 characters or fewer.")
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u,
    "Use letters, digits, spaces, dots, slashes, underscores or hyphens only.");
export const irregularityReason=z.string().trim()
  .min(10,"Explain the irregularity in at least 10 characters.")
  .max(1000,"Explanation cannot exceed 1,000 characters.");
const mark=z.number({invalid_type_error:"Enter a valid number."})
  .finite("Enter a finite number.")
  .min(0,"Scores cannot be negative.")
  .max(100,"Scores cannot exceed 100.")
  .refine(v=>Number.isInteger(Math.round(v*100))&&Math.abs(v*100-Math.round(v*100))<0.000001,
    "Use no more than two decimal places.");

const base={
  classId:uuidString,
  termId:uuidString,
  reason:irregularityReason,
};
export const submitIrregularitySchema=z.discriminatedUnion("kind",[
  z.object({
    ...base,kind:z.literal("ADD_STUDENT"),
    fullName:personName,
    admissionNumber,
  }).strict(),
  z.object({
    ...base,kind:z.literal("EDIT_MARK"),
    studentId:uuidString,subjectId:uuidString,
    ca:mark,
    exam:mark,
  }).strict(),
]);

// Never silently coerce an empty field to zero. Numeric strings from HTML
// input[type=number] must be complete decimal values, not 1e3, NaN or 5abc.
export function parseScoreInput(raw:string):number|null{
  const text=raw.trim();
  if(!/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$/.test(text))return null;
  const num=Number(text);
  return Number.isFinite(num) ? num : null;
}

export function validateScoreLimits(ca:number,exam:number,caMax:number,examMax:number):
  {ca?:string;exam?:string} {
  const errors:{ca?:string;exam?:string}={};
  if(!Number.isFinite(caMax)||caMax<0||!Number.isFinite(examMax)||examMax<0){
    return {ca:"School score limits are unavailable.",exam:"School score limits are unavailable."};
  }
  if(ca>caMax)errors.ca=`CA must not exceed ${caMax}.`;
  if(exam>examMax)errors.exam=`Exam must not exceed ${examMax}.`;
  return errors;
}

const note=z.string().trim().max(1000,"Notes cannot exceed 1,000 characters.");
export const classIrregularityDecisionSchema=z.object({
  action:z.enum(["ENDORSE","REJECT"]),
  note:note.default(""),
}).strict().refine(v=>v.action!=="REJECT"||v.note.length>=10,{
  message:"Give at least 10 characters explaining a rejection",path:["note"],
});
export const adminIrregularityDecisionSchema=z.object({
  action:z.enum(["APPROVE","REJECT"]),
  note:note.default(""),
}).strict().refine(v=>v.action!=="REJECT"||v.note.length>=10,{
  message:"Give at least 10 characters explaining a rejection",path:["note"],
});
