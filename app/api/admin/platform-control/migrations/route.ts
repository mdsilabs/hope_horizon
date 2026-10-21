import {NextResponse,type NextRequest} from "next/server";
import {z} from "zod";
import {requirePlatformOwner} from "@/lib/platform/owner";
import {applyApprovedMigration,getMigrationOverview} from "@/lib/platform/migration-runner";
import {getApprovedMigration} from "@/lib/platform/migration-catalog";
import {AppError,AuthorizationError,handleApiError} from "@/lib/utils/errors";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const applySchema=z.object({
  migrationId:z.string().regex(/^\d{4}$/),
  confirmation:z.string().min(10).max(150),
}).strict();

export async function GET(){
  try{
    await requirePlatformOwner();
    const overview=await getMigrationOverview();
    return NextResponse.json(overview,{headers:{
      "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff",
    }});
  }catch(error){return handleApiError(error);}
}
export async function POST(request:NextRequest){
  try{
    const session=await requirePlatformOwner();
    const origin=request.headers.get("origin");
    if(!origin||origin!==request.nextUrl.origin)
      throw new AuthorizationError("Migration requests must originate from this school's portal.");
    const body=applySchema.parse(await request.json());
    const migration=getApprovedMigration(body.migrationId);
    if(!migration)throw new AppError("Migration is not in the approved list.",422);
    const expected=`APPLY ${migration.id}`;
    if(body.confirmation!==expected)
      throw new AppError(`Type ${expected} exactly to confirm this migration.`,422);

    const result=await applyApprovedMigration(migration.id,
      session.authUserId,session.profile.school_id);
    return NextResponse.json({
      message:`Approved migration ${result.id} applied successfully.`,
      migration:result,
    },{headers:{"Cache-Control":"no-store, private"}});
  }catch(error){return handleApiError(error);}
}
