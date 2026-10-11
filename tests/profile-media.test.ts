import test from "node:test";
import assert from "node:assert/strict";
import { profilePatchSchema,adminUserPatchSchema,mediaSettingsSchema } from "../lib/validations/profile-media";

test("profiles may only edit contact details, never authorization",()=>{
  const valid={name:"Hope Horizon Admin",phone:"+234 900 111 2222",whatsappNumber:""};
  assert.equal(profilePatchSchema.safeParse(valid).success,true);
  assert.equal(profilePatchSchema.safeParse({...valid,role:"ADMIN"}).success,false);
  assert.equal(profilePatchSchema.safeParse({...valid,avatar_url:"https://example.com/evil.jpg"}).success,false);
  assert.equal(adminUserPatchSchema.safeParse({...valid,email:"hijack@example.com"}).success,false);
});
test("Cloudinary settings reject secret fields and unsafe paths",()=>{
  const valid={cloudName:"my_cloud-123",folder:"avatars",enabled:true};
  assert.equal(mediaSettingsSchema.safeParse(valid).success,true);
  assert.equal(mediaSettingsSchema.safeParse({...valid,folder:"../secrets"}).success,false);
  assert.equal(mediaSettingsSchema.safeParse({...valid,apiSecret:"not-allowed"}).success,false);
});
