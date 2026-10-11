import "server-only";
import nodemailer from "nodemailer";

/** Gmail SMTP service credentials live exclusively in Vercel server settings.
 * Passwords are Gmail App Passwords, not Google account passwords. */
export function gmailSmtpConfigured():boolean{
 return (process.env.EMAIL_PROVIDER||"gmail").toLowerCase()==="gmail" &&
   process.env.SMTP_HOST==="smtp.gmail.com" &&
   (process.env.SMTP_PORT==="465"||process.env.SMTP_PORT==="587") &&
   Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.EMAIL_FROM);
}

function getTransport(){
 if(!gmailSmtpConfigured())throw new Error("Gmail SMTP is not configured server-side.");
 const port=Number(process.env.SMTP_PORT);
 return nodemailer.createTransport({
  host:"smtp.gmail.com",
  port, secure:port===465, requireTLS:port===587,
  auth:{user:process.env.SMTP_USER!,pass:process.env.SMTP_PASSWORD!},
  tls:{servername:"smtp.gmail.com",minVersion:"TLSv1.2"},
  connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
 });
}

export async function sendGmailMessage(to:string,subject:string,body:string):Promise<void>{
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||to.length>254)
  throw new Error("Recipient email is unavailable.");
 if(subject.length>160 || /[\r\n]/.test(subject))throw new Error("Invalid email subject.");
 const transport=getTransport();
 try{
  await transport.sendMail({
   from:process.env.EMAIL_FROM!,
   to,subject,text:body.slice(0,5000),
  });
 }finally{transport.close();}
}

export async function testGmailSmtp(recipient:string):Promise<void>{
 await sendGmailMessage(recipient,"Hope Horizon: Gmail SMTP test",
  "This email confirms that the Hope Horizon results portal can send notifications using your configured Gmail SMTP account. No student results are included.");
}
