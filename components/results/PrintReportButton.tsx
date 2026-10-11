"use client";
import {Printer} from "lucide-react";
export function PrintReportButton(){
 return <button type="button" onClick={()=>window.print()}
  className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
  <Printer className="h-4 w-4"/> Print or save as PDF
 </button>;
}
