import {notFound} from "next/navigation";
import {getCurrentSession} from "@/lib/auth/getCurrentSession";
import {configuredPlatformOwner} from "@/lib/platform/owner";

export default async function PlatformControlLayout({children}:{children:React.ReactNode}){
  const session=await getCurrentSession();
  if(!session||!configuredPlatformOwner(session))notFound();
  return <>{children}</>;
}
