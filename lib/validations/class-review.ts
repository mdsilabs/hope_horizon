import {z} from "zod";
import {uuidString} from "@/lib/validations/common";

export const classReviewActionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("REQUEST_CORRECTION"),subjectId:uuidString,reason:z.string().trim().min(5).max(500)}).strict(),
  z.object({action:z.literal("CLEAR_CORRECTION"),requestId:uuidString}).strict(),
  z.object({action:z.literal("SIGN_OFF")}).strict(),
]);
