import {z} from "zod";
import {uuidString} from "@/lib/validations/common";

export const reportEntryInputSchema=z.object({
 studentId:uuidString,
 present:z.number().int().min(0).max(366),
 absent:z.number().int().min(0).max(366),
 totalDays:z.number().int().min(1).max(366),
 remark:z.string().trim().min(3).max(500),
}).strict().refine(x=>x.present+x.absent===x.totalDays,{
 path:["totalDays"],message:"Days present and absent must equal total school days.",
});
export const classReportEntriesSchema=z.object({
 entries:z.array(reportEntryInputSchema).min(1).max(250).refine(
  rows=>new Set(rows.map(row=>row.studentId)).size===rows.length,
  "Enter each enrolled student only once."),
}).strict();
export const classPublicationActionSchema=z.object({
 action:z.enum(["PUBLISH","WITHDRAW"]),
}).strict();
