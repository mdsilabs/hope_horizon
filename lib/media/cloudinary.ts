import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/utils/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type MediaSettings = Database["public"]["Tables"]["school_media_settings"]["Row"];

export function hasCloudinaryCredentials() {
  return Boolean(process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

export function assertMatchingCloudName(cloudName: string) {
  const bound = process.env.CLOUDINARY_CLOUD_NAME;
  if (bound && bound !== cloudName)
    throw new AppError("Configured cloud name does not match CLOUDINARY_CLOUD_NAME on the server.",409,"CLOUD_NAME_MISMATCH");
}

function credentialHeader() {
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!key || !secret)throw new AppError(
    "Cloudinary credentials are not configured. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in Vercel server environment variables.",
    503, "CLOUDINARY_NOT_CONFIGURED"
  );
  return "Basic " + Buffer.from(key + ":" + secret).toString("base64");
}

export async function getSchoolMediaSettings(schoolId:string):Promise<MediaSettings|null>{
  const db=createAdminClient();
  const {data,error}=await db.from("school_media_settings").select("*")
    .eq("school_id",schoolId).maybeSingle();
  if(error)throw new AppError("Cloudinary settings are unavailable. Apply migration 0007.",503,"MIGRATION_REQUIRED");
  return data;
}

export function safeImageMime(bytes: Uint8Array, claimed:string):string|null {
  if(claimed==="image/png" && bytes.length>=8 &&
    bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71 &&
    bytes[4]===13 && bytes[5]===10 && bytes[6]===26 && bytes[7]===10)return "image/png";
  if(claimed==="image/jpeg" && bytes.length>=3 &&
    bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return "image/jpeg";
  if(claimed==="image/webp" && bytes.length>=12 &&
    String.fromCharCode(...bytes.slice(0,4))==="RIFF" &&
    String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "image/webp";
  return null;
}

export async function uploadAvatarToCloudinary(file:File,schoolId:string,cloud:MediaSettings){
  if(!cloud.enabled)throw new AppError("Cloudinary uploads are disabled for this school.",409);
  assertMatchingCloudName(cloud.cloud_name);
  if(!hasCloudinaryCredentials())credentialHeader();
  if(file.size===0 || file.size>3*1024*1024)
    throw new AppError("Choose an image no larger than 3 MB.",422);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const mime=safeImageMime(bytes,file.type);
  if(!mime)throw new AppError("Only valid JPG, PNG and WebP images are supported.",422);
  // Keep each school within its own prefix; cloud name/folder are validated.
  const root=`hope-horizon/${schoolId}/${cloud.folder}`;
  const form=new FormData();
  form.set("file",new Blob([bytes],{type:mime}),"profile."+mime.split("/")[1]);
  form.set("folder",root);
  form.set("public_id",randomUUID());
  const response=await fetch(`https://api.cloudinary.com/v1_1/${cloud.cloud_name}/image/upload`,{
    method:"POST",headers:{Authorization:credentialHeader()},body:form,
    signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw new AppError("Cloudinary rejected this upload. Check configuration and try again.",502);
  const data=await response.json() as {secure_url?:string;public_id?:string;resource_type?:string};
  if(!data.secure_url || !data.public_id ||
    data.resource_type!=="image" || !data.public_id.startsWith(root+"/"))
    throw new AppError("Cloudinary returned an unexpected upload response.",502);
  const url=new URL(data.secure_url);
  if(url.protocol!=="https:" || url.hostname!=="res.cloudinary.com" ||
    !url.pathname.startsWith("/"+cloud.cloud_name+"/image/upload/"))
    throw new AppError("Cloudinary returned an unexpected delivery URL.",502);
  return url.toString();
}

export async function testCloudinaryConnection(cloudName:string){
  assertMatchingCloudName(cloudName);
  const response=await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image?max_results=1`,{
    method:"GET",headers:{Authorization:credentialHeader()},
    signal:AbortSignal.timeout(10000),
  });
  return response.ok;
}
