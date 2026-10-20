import Link from "next/link";
import {loadParentFamily} from "@/lib/parent/family";
import {createClient} from "@/lib/supabase/server";
import {Card,CardHeader} from "@/components/ui/Card";
import {EmptyState} from "@/components/ui/States";
import {Table,TableHead,TableBody,TableRow,TableHeaderCell,TableCell} from "@/components/ui/Table";

export default async function ParentResultsPage({
  searchParams,
}:{
  searchParams:Promise<{childId?:string}>;
}){
  const family=await loadParentFamily();
  const db=await createClient();
  const {childId}=await searchParams;
  const authorizedChildren=family.children;
  // Invalid child IDs are never fed into the query, and are not allowed
  // to reveal another student's records even if a policy changes.
  const chosen=authorizedChildren.find(c=>c.id===childId);
  const selectedId=childId?(chosen?.id??null):null;
  let results: {
    id:string;overall_average:number|null;overall_position:number|null;
    published_at:string|null;student_id:string;
    students:{full_name:string}|null;classes:{name:string}|null;
    terms:{name:string}|null;academic_sessions:{name:string}|null;
  }[]=[];
  let errorMessage="";
  const allowedIds=selectedId?[selectedId]:childId?[]:authorizedChildren.map(c=>c.id);
  if(allowedIds.length){
    const {data,error}=await db.from("results")
      .select("id,student_id,overall_average,overall_position,published_at,students(full_name),classes(name),terms(name),academic_sessions(name)")
      .eq("school_id",family.schoolId).eq("status","PUBLISHED")
      .in("student_id",allowedIds).order("published_at",{ascending:false}).limit(300);
    if(error)errorMessage="Could not load published results. Please try again.";
    else results=(data??[]) as unknown as typeof results;
  }
  return <div className="mx-auto max-w-6xl space-y-6">
    <div>
      <h1 className="font-display text-2xl font-semibold text-slate-900">Children&apos;s results</h1>
      <p className="mt-1 text-sm text-slate-600">Only published report cards for students linked to your family account.</p>
    </div>
    <nav aria-label="Choose child" className="flex flex-wrap gap-2">
      <Link href="/parent/results"
        className={`rounded-xl px-3 py-2 text-sm font-semibold ${!childId?"bg-brand-50 text-brand-700":"border text-slate-600"}`}>
        All children
      </Link>
      {authorizedChildren.map(c=><Link key={c.id} href={`/parent/results?childId=${encodeURIComponent(c.id)}`}
        className={`rounded-xl px-3 py-2 text-sm font-semibold ${selectedId===c.id?"bg-brand-50 text-brand-700":"border text-slate-600"}`}>
        {c.full_name}
      </Link>)}
    </nav>
    {childId&&!selectedId&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
      This child is not linked to your family account.
    </p>}
    {errorMessage&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
    <Card>
      <CardHeader title={`${results.length} published ${results.length===1?"result":"results"}`}/>
      {results.length===0?<EmptyState title="No published results available"
        description="Reports will appear once they are reviewed, approved and published by the school."/>:
        <Table>
          <TableHead><TableRow>
            <TableHeaderCell>Child</TableHeaderCell>
            <TableHeaderCell>Session and term</TableHeaderCell>
            <TableHeaderCell>Class</TableHeaderCell>
            <TableHeaderCell>Average</TableHeaderCell>
            <TableHeaderCell>Position</TableHeaderCell>
            <TableHeaderCell>Report</TableHeaderCell>
          </TableRow></TableHead>
          <TableBody>{results.map(row=><TableRow key={row.id}>
            <TableCell className="font-medium">{row.students?.full_name??"Student"}</TableCell>
            <TableCell>{row.academic_sessions?.name??"Session"} · {row.terms?.name??"Term"}</TableCell>
            <TableCell>{row.classes?.name??"Class"}</TableCell>
            <TableCell>{row.overall_average??"—"}</TableCell>
            <TableCell>{row.overall_position??"—"}</TableCell>
            <TableCell><Link href={`/parent/results/${row.id}`} className="font-semibold text-brand-700 hover:underline">
              View / print
            </Link></TableCell>
          </TableRow>)}</TableBody>
        </Table>}
    </Card>
  </div>;
}
